import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { identifyPart, lookupBarcode } from '../services/api';
import { THEME } from '../constants/theme';

const resizeAndEncode = async (uri: string): Promise<string> => {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  return resized.base64!;
};

type Mode = 'label' | 'part' | 'barcode';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('label');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ partNumber: string; manufacturer: string; description: string; confidence: string } | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const scanLockRef = useRef(false);

  if (!permission) return <View style={s.container} />;

  if (!permission.granted) {
    return (
      <View style={s.container}>
        <View style={s.permBox}>
          <Ionicons name="camera-outline" size={56} color={THEME.colors.textMuted} />
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
    } finally {
      setLoading(false);
    }
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
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setPreview(null); setResult(null); scanLockRef.current = false; };

  const onBarcodeScanned = async ({ data: barcode }: BarcodeScanningResult) => {
    if (scanLockRef.current || loading) return;
    scanLockRef.current = true;
    setLoading(true);
    try {
      const part = await lookupBarcode(barcode);
      if (!part) {
        // barcode not in DigiKey — fall back to searching the raw value
        router.replace({ pathname: '/(tabs)', params: { query: barcode } });
        return;
      }
      setResult({
        partNumber: part.vendorSku || part.partNumber,
        manufacturer: part.name,
        description: part.description,
        confidence: 'high',
      });
      setPreview('barcode');
    } catch {
      Alert.alert('Lookup failed', 'Could not identify this barcode. Try scanning again.');
      scanLockRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  const searchQuery = result?.partNumber || result?.description || '';

  const search = () => {
    if (!searchQuery) return;
    router.replace({ pathname: '/(tabs)', params: { query: searchQuery } });
  };

  const confidenceColor = { high: '#16a34a', medium: '#d97706', low: '#dc2626' }[result?.confidence ?? 'low'];
  const isExactMatch = result?.confidence === 'high';
  const matchLabel = isExactMatch ? 'Exact Match' : result?.confidence === 'medium' ? 'Close Match' : 'Showing Similar Parts';

  // Preview + result screen
  if (preview) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={reset} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>{result ? matchLabel : 'Part Identified'}</Text>
          <View style={{ width: 32 }} />
        </View>

        {preview !== 'barcode' && (
          <Image source={{ uri: preview! }} style={s.previewImage} resizeMode="cover" />
        )}

        {loading && (
          <View style={s.analyzingBox}>
            <View style={s.analyzingSpinnerWrap}>
              <ActivityIndicator size="large" color={THEME.colors.accent} />
            </View>
            <Text style={s.analyzingTitle}>Analyzing with AI...</Text>
            <Text style={s.analyzingSub}>Identifying part, manufacturer, and model number</Text>
          </View>
        )}

        {!loading && result && (
          <View style={s.resultBox}>
            {/* Match type banner */}
            <View style={[s.matchBanner, { backgroundColor: isExactMatch ? THEME.colors.successSubtle : result.confidence === 'medium' ? THEME.colors.warningSubtle : THEME.colors.surfaceElevated }]}>
              <Ionicons
                name={isExactMatch ? 'checkmark-circle' : result.confidence === 'medium' ? 'git-compare-outline' : 'albums-outline'}
                size={15}
                color={isExactMatch ? THEME.colors.success : result.confidence === 'medium' ? THEME.colors.warning : THEME.colors.accent}
              />
              <Text style={[s.matchBannerText, { color: isExactMatch ? THEME.colors.success : result.confidence === 'medium' ? THEME.colors.warning : THEME.colors.accent }]}>
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
                <Ionicons name="information-circle-outline" size={14} color={THEME.colors.textMuted} />
                <Text style={s.similarNoteText}>No part number found — searching for similar items</Text>
              </View>
            ) : null}

            <View style={s.actionRow}>
              <TouchableOpacity style={s.retakeBtn} onPress={reset}>
                <Ionicons name="camera-outline" size={18} color={THEME.colors.accent} />
                <Text style={s.retakeBtnText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.searchBtn, !searchQuery && { opacity: 0.4 }]}
                onPress={search}
                disabled={!searchQuery}
              >
                <Ionicons name="search" size={18} color="#fff" />
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
          <Ionicons name="arrow-back" size={24} color="#fff" />
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
          <Ionicons name="pricetag-outline" size={16} color={mode === 'label' ? '#fff' : THEME.colors.textSecondary} />
          <Text style={[s.modeBtnText, mode === 'label' && { color: '#fff' }]}>Scan Label</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'part' && s.modeBtnActive]}
          onPress={() => setMode('part')}
        >
          <Ionicons name="cube-outline" size={16} color={mode === 'part' ? '#fff' : THEME.colors.textSecondary} />
          <Text style={[s.modeBtnText, mode === 'part' && { color: '#fff' }]}>Identify Part</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'barcode' && s.modeBtnActive]}
          onPress={() => { setMode('barcode'); scanLockRef.current = false; }}
        >
          <Ionicons name="barcode-outline" size={16} color={mode === 'barcode' ? '#fff' : THEME.colors.textSecondary} />
          <Text style={[s.modeBtnText, mode === 'barcode' && { color: '#fff' }]}>Barcode</Text>
        </TouchableOpacity>
      </View>

      <View style={s.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="back"
          onBarcodeScanned={mode === 'barcode' ? onBarcodeScanned : undefined}
          barcodeScannerSettings={mode === 'barcode' ? {
            barcodeTypes: ['code128', 'code39', 'datamatrix', 'qr', 'ean13', 'ean8', 'upc_a', 'upc_e'],
          } : undefined}
        />
        {/* Targeting overlay — outside CameraView to avoid children warning */}
        <View style={s.overlay}>
          <View style={mode === 'barcode' ? s.barcodeFrame : s.frame}>
            <View style={[s.corner, s.tl]} />
            <View style={[s.corner, s.tr]} />
            <View style={[s.corner, s.bl]} />
            <View style={[s.corner, s.br]} />
          </View>
          {loading && mode === 'barcode' && (
            <ActivityIndicator size="large" color="#fff" style={{ marginTop: 16 }} />
          )}
          <Text style={s.hint}>
            {mode === 'label'
              ? 'Align the label or data tag inside the frame'
              : mode === 'barcode'
              ? 'Point at any barcode — it scans automatically'
              : 'Point at the part or component'}
          </Text>
        </View>
      </View>

      <View style={s.captureRow}>
        {mode !== 'barcode' && (
          <TouchableOpacity style={s.galleryBtn} onPress={pickFromLibrary} disabled={loading}>
            <Ionicons name="images-outline" size={26} color="#fff" />
            <Text style={s.galleryBtnText}>Library</Text>
          </TouchableOpacity>
        )}

        {mode === 'barcode'
          ? <View style={s.barcodeHint}><Text style={s.barcodeHintText}>Auto-scanning...</Text></View>
          : loading
          ? <ActivityIndicator size="large" color="#fff" />
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
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: THEME.colors.background, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  headerTitle: { color: THEME.colors.textPrimary, fontSize: 18, fontWeight: '700' },

  // Permission
  permBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12, backgroundColor: THEME.colors.background },
  permTitle: { fontSize: 20, fontWeight: '700', color: THEME.colors.textPrimary },
  permSub: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center' },
  permBtn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Mode toggle
  modeRow: { flexDirection: 'row', backgroundColor: THEME.colors.background, paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: THEME.radius.button, borderWidth: 1, borderColor: THEME.colors.border },
  modeBtnActive: { backgroundColor: THEME.colors.accent, borderColor: THEME.colors.accent },
  modeBtnText: { color: THEME.colors.textSecondary, fontWeight: '600', fontSize: 14 },

  // Camera
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', gap: 24 },
  frame: { width: 280, height: 180, position: 'relative' },
  barcodeFrame: { width: 300, height: 120, position: 'relative' },
  barcodeHint: { alignItems: 'center' },
  barcodeHintText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff', borderWidth: 3 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: { color: '#fff', fontSize: 13, textAlign: 'center', paddingHorizontal: 32, opacity: 0.85 },

  // Capture button
  captureRow: { height: 120, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#000', paddingHorizontal: 24 },
  galleryBtn: { width: 64, alignItems: 'center', gap: 4 },
  galleryBtnText: { color: '#fff', fontSize: 11, opacity: 0.8 },
  captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },

  // Preview / result
  previewImage: { width: '100%', height: 260 },
  analyzingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.colors.surface, gap: 14, paddingHorizontal: 32 },
  analyzingSpinnerWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: THEME.colors.surfaceElevated, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  analyzingTitle: { fontSize: 18, fontWeight: '700', color: THEME.colors.textPrimary },
  analyzingSub: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  resultBox: { flex: 1, backgroundColor: THEME.colors.surface, padding: 20, gap: 8 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  confidenceText: { fontSize: 13, fontWeight: '600' },
  matchBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: THEME.radius.button, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4 },
  matchBannerText: { fontSize: 13, fontWeight: '700' },
  matchBannerSub: { fontSize: 12, color: THEME.colors.textMuted },
  similarNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.badge, paddingHorizontal: 10, paddingVertical: 7 },
  similarNoteText: { fontSize: 12, color: THEME.colors.textSecondary, flex: 1 },
  manufacturer: { fontSize: 14, color: THEME.colors.textSecondary, fontWeight: '500' },
  partNumber: { fontSize: 28, fontWeight: '800', color: THEME.colors.textPrimary, fontVariant: ['tabular-nums'] },
  description: { fontSize: 14, color: THEME.colors.textSecondary, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 'auto', paddingTop: 16 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 14, flex: 1 },
  retakeBtnText: { color: THEME.colors.accent, fontWeight: '600', fontSize: 15 },
  searchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 14, flex: 2 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
