# Procurement Assistant — Image Messages Design

**Date:** 2026-05-24
**Status:** Approved

## Goal

Let engineers attach a photo (camera or library) to a message in the procurement assistant chat. Claude receives the image as a vision input alongside the text, so it can identify parts from physical components or labels and continue the conversation naturally.

---

## Architecture

Two layers are touched — mobile and backend. No new screens or routes.

### Mobile changes

**`mobile/app/procurement/[id].tsx`**

1. **Camera icon** — added to the left of the `TextInput` in the input bar. Tapping opens an `ActionSheet` with two options: "Take Photo" (launches `expo-camera`) and "Choose from Library" (launches `expo-image-picker`). Both are already installed.

2. **Image processing** — same pipeline as `mobile/app/camera.tsx`: resize to 1024px width, compress to JPEG at 0.7 quality via `expo-image-manipulator`, encode to base64.

3. **`pendingImage` state** — `useState<string | null>(null)` holds the base64 string before send. When non-null, a preview strip renders above the input bar:
   ```
   [ 🖼 80×80 thumbnail, rounded ] [ ✕ ]
   ```
   Tapping ✕ clears `pendingImage`.

4. **Send button enabled** when `input.trim() || pendingImage` — an image alone (no text) is a valid message.

5. **`handleSend` updated** — passes `imageBase64: pendingImage ?? undefined` to `sendProcurementMessage`. Clears `pendingImage` after send. The optimistic message stores the base64 in a `imageCache` (see below).

6. **`imageCache: Record<string, string>`** — session-only `useState` map of `messageId → base64`. The optimistic user message keeps its `temp-${Date.now()}` ID throughout the session (the current `handleSend` never replaces the user message with a server ID). The base64 is stored under that temp ID immediately before the API call, so the thumbnail renders whether the send succeeds or fails.

7. **Message rendering updated**:
   - User messages with an entry in `imageCache`: render a `<Image>` thumbnail (200px tall, full bubble width, `borderRadius: 10`) above the text bubble. If text is empty, show only the image.
   - User messages loaded from history where `hasImage === true` (flag returned by API): show a `📷 Photo attached` grey badge above the text bubble.
   - All other messages: unchanged.

**`mobile/services/api.ts`**

Update `sendProcurementMessage`:
```typescript
export const sendProcurementMessage = async (
  id: string,
  content: string,
  imageBase64?: string,
): Promise<ProcurementMessage> => {
  const { data } = await api.post(`/procurement/${id}/messages`, {
    content,
    ...(imageBase64 ? { imageBase64 } : {}),
  });
  return data as ProcurementMessage;
};
```

**`mobile/types/index.ts`**

Add `hasImage?: boolean` to `ProcurementMessage`:
```typescript
export interface ProcurementMessage {
  id: string;
  role: 'user' | 'assistant';
  messageType: 'text' | 'parts_list';
  content: string;
  parts: ProcurementPart[] | null;
  hasImage?: boolean;
  createdAt: string;
}
```

---

### Backend changes

**`backend/src/procurement/entities/procurement-message.entity.ts`**

Add `hasImage` column (TypeORM adds the column on next sync/migration):
```typescript
@Column({ name: 'has_image', default: false })
hasImage: boolean;
```

**`backend/src/procurement/procurement.controller.ts`**

The controller currently destructures `{ content }` from the request body. Update to also accept `imageBase64`:
```typescript
@Post(':id/messages')
sendMessage(
  @Param('id') id: string,
  @Request() req,
  @Body() body: { content: string; imageBase64?: string },
) {
  return this.procurementService.sendMessage(id, req.user.userId, body.content, body.imageBase64);
}
```

**`backend/src/procurement/procurement.service.ts`**

1. **`sendMessage` signature** — add optional `imageBase64?: string` param.

2. **Store `hasImage`** — when saving the user message:
   ```typescript
   await this.msgRepo.save(
     this.msgRepo.create({
       conversationId,
       role: 'user',
       messageType: 'text',
       content: userContent,
       parts: null,
       hasImage: !!imageBase64,
     }),
   );
   ```

3. **Multimodal Claude message** — when `imageBase64` is present, the user's entry in the `messages` array passed to Claude becomes a content array instead of a plain string:
   ```typescript
   const userClaudeContent = imageBase64
     ? [
         { type: 'image' as const, source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: imageBase64 } },
         { type: 'text' as const, text: userContent || 'What is this part?' },
       ]
     : userContent;
   ```
   The `messages` array sent to Claude uses this for the last user message.

4. **History reconstruction** — for prior messages, keep the existing text-only approach. When a history message has `hasImage: true`, prepend `[Image attached] ` to the content:
   ```typescript
   const messages = history.slice(0, -1).map(m => ({
     role: m.role as 'user' | 'assistant',
     content: m.role === 'assistant' && m.messageType === 'parts_list'
       ? `[Parts list generated: ${m.content}]`
       : m.hasImage
         ? `[Image attached] ${m.content}`
         : m.content,
   }));
   // Last message is the one just saved — use multimodal if image present
   messages.push({ role: 'user', content: userClaudeContent });
   ```

5. **Default text for image-only messages** — if `userContent` is empty and an image is provided, use `'What is this part?'` as the text sent to Claude (handled in step 3 above).

---

## Data Flow

```
Engineer taps camera icon
  → ActionSheet: "Take Photo" | "Choose from Library"
  → expo-camera / expo-image-picker
  → expo-image-manipulator resize + JPEG base64
  → pendingImage state set → preview strip shown

Engineer taps Send
  → handleSend: content + imageBase64 sent to API
  → sendProcurementMessage POST /procurement/:id/messages { content, imageBase64 }
  → backend saves user message (hasImage: true)
  → backend builds multimodal content array for Claude
  → Claude responds (text or parts_list JSON)
  → assistant message saved and returned
  → mobile appends assistant message to chat
  → imageCache stores base64 under real message ID
  → thumbnail shown in user bubble for current session
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Camera permission denied | `Alert.alert('Camera access required', 'Enable it in Settings.')` |
| Image picker cancelled | No action — `pendingImage` unchanged |
| `expo-image-manipulator` throws | `Alert.alert('Could not process image. Try again.')` — `pendingImage` stays null |
| Send fails with image attached | `pendingImage` kept, optimistic message removed — user can retry |
| Backend receives oversized payload | Express body-parser 413 error → mobile shows `Alert.alert('Image too large. Try a lower-resolution photo.')` |

---

## Dependencies

All required packages are already installed:
- `expo-camera` — camera capture
- `expo-image-picker` — photo library access
- `expo-image-manipulator` — resize + compress + base64 encode

No new packages needed.

---

## Testing

**Unit tests** — none added (no pure utility functions introduced).

**Manual tests:**
- Tap camera icon → action sheet shows "Take Photo" and "Choose from Library"
- Take photo → thumbnail preview appears above input with ✕ dismiss
- Dismiss → thumbnail removed, send button disabled if input also empty
- Send image + text → Claude responds describing the part / asking follow-up questions
- Send image with no text → Claude still receives "What is this part?" and responds
- Reply contains parts_list → parts list renders, prices load normally
- Reload conversation → messages with images show "📷 Photo attached" badge
- Camera permission denied → alert shown, picker not opened
- Send fails (network off) → pending image kept, retry works

---

## What This Is Not

- No image storage on the server — images are not persisted after being sent to Claude
- No image-to-image follow-ups — Claude does not see the same image in subsequent history turns (summarized as `[Image attached]`)
- No multiple images per message — one image attachment per send
- No image compression quality settings or format options
