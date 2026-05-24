# Conversational Procurement Design

**Date:** 2026-05-23
**Status:** Approved

## Goal

A multi-turn AI chat where a maintenance engineer describes a repair job and Claude generates a complete parts list with live vendor prices — all from a dedicated tab in the app.

---

## Architecture

### Backend: `procurement` NestJS Module

**New files:**
- `backend/src/procurement/entities/procurement-conversation.entity.ts`
- `backend/src/procurement/entities/procurement-message.entity.ts`
- `backend/src/procurement/procurement.module.ts`
- `backend/src/procurement/procurement.controller.ts`
- `backend/src/procurement/procurement.service.ts`

**Entities:**

`ProcurementConversation`:
```
id: uuid (PK)
userId: string
title: string (auto-set from Claude's first response)
createdAt: Date
updatedAt: Date
messages: ProcurementMessage[] (relation)
```

`ProcurementMessage`:
```
id: uuid (PK)
conversationId: uuid (FK → procurement_conversations)
role: 'user' | 'assistant'
messageType: 'text' | 'parts_list'
content: string (plain text — summary sentence for parts_list, full reply for text)
parts: JSONB | null (populated only when messageType === 'parts_list')
createdAt: Date
```

Each item in the `parts` array:
```json
{
  "partNumber": "string",
  "description": "string",
  "quantity": 1,
  "notes": "string"
}
```

**Endpoints (all require JwtAuthGuard):**
```
POST   /api/v1/procurement              → create conversation (returns { id, title, createdAt })
GET    /api/v1/procurement              → list user's conversations (id, title, updatedAt)
GET    /api/v1/procurement/:id          → get conversation with all messages
POST   /api/v1/procurement/:id/messages → send a message, get assistant response
DELETE /api/v1/procurement/:id          → delete conversation and all its messages
```

**`sendMessage` flow:**
1. Save user message to DB (`role: 'user'`, `messageType: 'text'`)
2. Fetch all messages for this conversation, ordered by `createdAt ASC`
3. Build Claude `messages` array from history (map `role` and `content` directly)
4. Call `claude-sonnet-4-6` with system prompt (see below)
5. Parse JSON response — detect `type: "text"` vs `type: "parts_list"`
6. Save assistant message to DB with correct `messageType` and `parts`
7. Update `ProcurementConversation.title` on the first assistant response (from the `title` field Claude returns)
8. Return the saved assistant message to the client

**Claude system prompt (abbreviated):**
```
You are a procurement assistant for industrial maintenance engineers.
Help the user identify all parts needed for their repair job through conversation.
Ask clarifying questions until you have enough information (equipment model, failure mode, quantities needed).

When ready to generate the parts list, respond ONLY with valid JSON:
{
  "type": "parts_list",
  "title": "short job title (max 6 words)",
  "summary": "one sentence describing the parts list",
  "parts": [
    {
      "partNumber": "exact part number or best known identifier",
      "description": "part description",
      "quantity": 1,
      "notes": "why this part is needed"
    }
  ]
}

When asking a clarifying question or making a conversational reply, respond ONLY with valid JSON:
{
  "type": "text",
  "title": null,
  "content": "your message here"
}

RULES:
- Never use placeholder part numbers
- Suggest real parts from real manufacturers
- If unsure of an exact part number, use the best searchable identifier (e.g. "Grundfos CM5 impeller kit")
- Maximum 8 parts per list
```

**Error handling:**
- Claude parse failure → return `{ type: "text", content: "Sorry, I ran into an issue. Try rephrasing your request." }`, save to DB, HTTP 200
- DB failure saving message → HTTP 500
- Conversation not found or belongs to different user → HTTP 404

---

### Mobile: Two New Screens

#### New Tab: `mobile/app/(tabs)/procure.tsx` — Conversation List

Fourth tab in the bottom nav. Icon: `chatbubble-outline`. Label: "Assistant".

Shows:
- "New Conversation" button at top
- List of past conversations (title + relative timestamp, e.g. "2 hours ago")
- Empty state: icon + "Start your first procurement conversation"

Tapping "New Conversation" calls `POST /api/v1/procurement` and navigates to the chat screen with the new ID.

Tapping a past conversation navigates to the chat screen with that ID.

#### New Screen: `mobile/app/procurement/[id].tsx` — Chat Screen

Full chat interface. Messages rendered top-to-bottom, newest at bottom. Auto-scrolls to bottom when new messages arrive.

**Text message bubble** (assistant):
```
┌──────────────────────────────────────┐
│  What horsepower and frame size is   │
│  the motor you're replacing?         │
└──────────────────────────────────────┘
```
Blue background for assistant, light grey for user.

**Parts list message** (assistant):
```
┌──────────────────────────────────────────┐
│  Here are the parts you'll need:         │
│                                          │
│  [ ➕ Add All to Quote ]                 │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ VL3514               Qty: 1        │  │
│  │ 1HP 56C TEFC Motor                 │  │
│  │ Direct replacement                 │  │
│  │ Best price: $89.50 (Grainger)      │  │
│  │ ⏱ Fetching prices...              │  │
│  │ [Add to Quote]                     │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

Each part card:
- Fires `getPricesForPart(partNumber)` on mount
- Shows loading spinner until prices resolve
- Displays best price (lowest non-null price across vendors) once loaded
- "Add to Quote" button opens the existing quote modal (same flow as `part/[id].tsx`)

"Add All to Quote" button: opens quote modal with `selectedPrices` set to the best price for each part. Disabled until all prices have loaded (or a 15-second timeout, after which it uses whatever prices have resolved).

**Input bar:** Fixed at bottom. `TextInput` + Send button (`Ionicons name="send"`). Disabled + spinner while awaiting assistant response.

**Header:** Part title (conversation title, updates after first response). Back button. No refresh — conversation is append-only.

---

## Data Flow

```
User taps "New Conversation"
  → POST /api/v1/procurement
  → navigate to /procurement/:id

User types message → taps Send
  → POST /api/v1/procurement/:id/messages { content }
  → backend saves user message
  → backend fetches full history
  → Claude call (~3–6s)
  → backend parses response (text or parts_list)
  → backend saves assistant message
  → backend updates conversation title (first response only)
  → response returned to mobile

If messageType === 'text':
  → render text bubble

If messageType === 'parts_list':
  → render parts list card
  → for each part: fire getPricesForPart(partNumber) concurrently
  → prices populate card-by-card as scrapers resolve (~5–15s each)

User taps "Add to Quote" or "Add All to Quote"
  → existing quote modal opens
  → part(s) added to selected quote
```

---

## Tab Navigation

The bottom tab navigator (`mobile/app/(tabs)/_layout.tsx`) gains a fourth tab:

```typescript
<Tabs.Screen
  name="procure"
  options={{
    title: 'Assistant',
    tabBarIcon: ({ color }) => <Ionicons name="chatbubble-outline" size={24} color={color} />,
  }}
/>
```

The `procurement/[id].tsx` screen lives outside `(tabs)/` so it renders as a full-screen stack route (no tab bar visible).

---

## Testing

**Backend unit tests:**
- `ProcurementService.sendMessage` — mock Anthropic, assert `text` response is saved with `messageType: 'text'` and no `parts`
- `ProcurementService.sendMessage` — mock Anthropic with parts_list response, assert `messageType: 'parts_list'`, `parts` array saved correctly, `conversation.title` updated
- Claude parse failure — mock malformed response, assert fallback text message saved and returned

**Backend integration test:**
- `POST /api/v1/procurement` → assert 201 + `{ id, title, createdAt }`
- `POST /api/v1/procurement/:id/messages` → assert 201 + message shape

**Mobile manual test:**
- Start new conversation, describe a repair job end-to-end
- Verify clarifying question appears, answer it, verify parts list renders with prices loading
- Verify "Add All to Quote" creates a quote with all parts
- Close app, reopen, verify past conversation appears in the list

---

## What This Is Not

- No streaming — Claude's full response is returned at once
- No voice input — text only
- No image attachments in the chat — camera scan is a separate flow
- Price fetching is client-side (mobile calls existing `getPricesForPart`) — no new scraping infrastructure needed
