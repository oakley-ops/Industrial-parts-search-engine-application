import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { identifyPart } from '../services/api';
import { theme } from '../constants/theme';

const resizeAndEncode = async (uri: string): Promise<string> => {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return resized.base64!;
};

type Mode = 'label' | 'part';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('label');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ partNumber: string; manufacturer: string; description: string; confidence: string } | null>(null);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <View style={s.container}>
        <View style={s.permBox}>
          <Ionicons name="camera-outline" size={56} color={theme.colors.textMuted} />
          <Text style={s.permTitle}>Camera Access Needed</Text>
          <Text style={s.permSub}>Required to scan part labels and identify components</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const capture = async () => {
    if (!cameraRef.current) return;
    setLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 1 });
      setPreview(photo.uri);
      const base64 = await resizeAndEncode(photo.uri);
      const res = await identifyPart(base64, mode);
      setResult(res);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not process image');
      setPreview(null);
    } finally { setLoading(false); }
  };

  const pickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to pick images.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setLoading(true);
    try {
      setPreview(asset.uri);
      const base64 = await resizeAndEncode(asset.uri);
      const res = await identifyPart(base64, mode);
      setResult(res);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not process image');
      setPreview(null);
    } finally { setLoading(false); }
  };

  const reset = () => { setPreview(null); setResult(null); };

  const searchQuery = result?.partNumber || result?.description || '';

  const search = () => {
    if (!searchQuery) return;
    router.replace({ pathname: '/(tabs)', params: { query: searchQuery } });
  };

  const confidenceColor = {
    high: theme.colors.success,
    medium: theme.colors.warning,
    low: theme.colors.error,
  }[result?.confidence ?? 'low'];
  const isExactMatch = result?.confidence === 'high';
  const matchLabel = isExactMatch ? 'Exact Match' : result?.confidence === 'medium' ? 'Close Match' : 'Showing Similar Parts';

  // Preview + result screen
  if (preview) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={reset} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{result ? matchLabel : 'Part Identified'}</Text>
          <View style={{ width: 32 }} />
        </View>

        <Image source={{ uri: preview }} style={s.previewImage} resizeMode="cover" />

        {loading && (
          <View style={s.analyzingBox}>
            <View style={s.analyzingSpinnerWrap}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
            <Text style={s.analyzingTitle}>Analyzing with AI...</Text>
            <Text style={s.analyzingSub}>Identifying part, manufacturer, and model number</Text>
          </View>
        )}

        {!loading && result && (
          <View style={s.resultBox}>
            {/* Match type banner */}
            <View style={[
              s.matchBanner,
              {
                backgroundColor: isExactMatch
                  ? theme.colors.successSubtle
                  : result.confidence === 'medium'
                    ? theme.colors.warningSubtle
                    : theme.colors.secondarySubtle,
              },
            ]}>
              <Ionicons
                name={isExactMatch ? 'checkmark-circle' : result.confidence === 'medium' ? 'git-compare-outline' : 'albums-outline'}
                size={15}
                color={isExactMatch ? theme.colors.success : result.confidence === 'medium' ? theme.colors.warning : theme.colors.secondary}
              />
              <Text style={[s.matchBannerText, {
                color: isExactMatch ? theme.colors.success : result.confidence === 'medium' ? theme.colors.warning : theme.colors.secondary,
              }]}>
                {matchLabel}
              </Text>
              {!isExactMatch && (
                <Text style={s.matchBannerSub}> — results may vary</Text>
              )}
            </View>

            {result.manufacturer ? (
              <Text style={s.manufacturer}>{result.manufacturer}</Text>
            ) : null}

            <Text style={s.partNumber}>{result.partNumber || result.description || 'Could not identify'}</Text>

            {result.partNumber && result.description ? (
              <Text style={s.description} numberOfLines={3}>{result.description}</Text>
            ) : null}

            {!isExactMatch && searchQuery ? (
              <View style={s.similarNote}>
                <Ionicons name="information-circle-outline" size={14} color={theme.colors.textMuted} />
                <Text style={s.similarNoteText}>No part number found — searching for similar items</Text>
              </View>
            ) : null}

            <View style={s.actionRow}>
              <TouchableOpacity style={s.retakeBtn} onPress={reset}>
                <Ionicons name="camera-outline" size={18} color={theme.colors.secondary} />
                <Text style={s.retakeBtnText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.searchBtn, !searchQuery && { opacity: 0.4 }]}
                onPress={search}
                disabled={!searchQuery}
              >
                <Ionicons name="search" size={18} color={theme.colors.white} />
                <Text style={s.searchBtnText}>{isExactMatch ? 'Search This Part' : 'Find Similar Parts'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  // Camera viewfinder screen
  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Scan Part</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Mode toggle */}
      <View style={s.modeRow}>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'label' && s.modeBtnActive]}
          onPress={() => setMode('label')}
        >
          <Ionicons name="pricetag-outline" size={16} color={mode === 'label' ? theme.colors.white : theme.colors.textMuted} />
          <Text style={[s.modeBtnText, mode === 'label' && { color: theme.colors.white }]}>Scan Label</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'part' && s.modeBtnActive]}
          onPress={() => setMode('part')}
        >
          <Ionicons name="cube-outline" size={16} color={mode === 'part' ? theme.colors.white : theme.colors.textMuted} />
          <Text style={[s.modeBtnText, mode === 'part' && { color: theme.colors.white }]}>Identify Part</Text>
        </TouchableOpacity>
      </View>

      <CameraView ref={cameraRef} style={s.camera} facing="back">
        {/* Targeting overlay */}
        <View style={s.overlay}>
          <View style={s.frame}>
            <View style={[s.corner, s.tl]} />
            <View style={[s.corner, s.tr]} />
            <View style={[s.corner, s.bl]} />
            <View style={[s.corner, s.br]} />
          </View>
          <Text style={s.hint}>
            {mode === 'label'
              ? 'Align the label or data tag inside the frame'
              : 'Point at the part or component'}
          </Text>
        </View>
      </CameraView>

      <View style={s.captureRow}>
        <TouchableOpacity style={s.galleryBtn} onPress={pickFromLibrary} disabled={loading}>
          <Ionicons name="images-outline" size={26} color={theme.colors.white} />
          <Text style={s.galleryBtnText}>Library</Text>
        </TouchableOpacity>

        {loading
          ? <ActivityIndicator size="large" color={theme.colors.primary} />
          : (
            <TouchableOpacity style={s.captureBtn} onPress={capture}>
              <View style={s.captureInner} />
            </TouchableOpacity>
          )
        }

        <View style={{ width: 64 }} />
      </View>
    </View>
  );
}

const CORNER = 24;
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700' },

  // Permission
  permBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
    backgroundColor: theme.colors.background,
  },
  permTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary },
  permSub: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  permBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginTop: 8,
  },
  permBtnText: { color: theme.colors.white, fontWeight: '700', fontSize: 16 },

  // Mode toggle
  modeRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
  modeBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  modeBtnText: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 14 },

  // Camera
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },
  frame: { width: 280, height: 180, position: 'relative' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: theme.colors.primary, borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: { color: theme.colors.white, fontSize: 13, textAlign: 'center', paddingHorizontal: 32, opacity: 0.85 },

  // Capture button
  captureRow: {
    height: 120,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#000',
    paddingHorizontal: 24,
  },
  galleryBtn: { width: 64, alignItems: 'center', gap: 4 },
  galleryBtnText: { color: theme.colors.white, fontSize: 11, opacity: 0.8 },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.primary },

  // Preview / result
  previewImage: { width: '100%', height: 260 },
  analyzingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    gap: 14,
    paddingHorizontal: 32,
  },
  analyzingSpinnerWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  analyzingTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary },
  analyzingSub: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  resultBox: { flex: 1, backgroundColor: theme.colors.surface, padding: 20, gap: 8 },
  matchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  matchBannerText: { fontSize: 13, fontWeight: '700' },
  matchBannerSub: { fontSize: 12, color: theme.colors.textMuted },
  similarNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  similarNoteText: { fontSize: 12, color: theme.colors.textMuted, flex: 1 },
  manufacturer: { fontSize: 14, color: theme.colors.textMuted, fontWeight: '500' },
  partNumber: { fontSize: 28, fontWeight: '800', color: theme.colors.textPrimary, letterSpacing: 0.3 },
  description: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 'auto', paddingTop: 16 },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    borderRadius: theme.radius.xl,
    padding: 14,
    flex: 1,
  },
  retakeBtnText: { color: theme.colors.secondary, fontWeight: '600', fontSize: 15 },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xl,
    padding: 14,
    flex: 2,
  },
  searchBtnText: { color: theme.colors.white, fontWeight: '700', fontSize: 15 },
});
