import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { identifyPart } from '../services/api';

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
          <Ionicons name="camera-outline" size={56} color="#9ca3af" />
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
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      setPreview(photo.uri);
      const res = await identifyPart(photo.base64!, mode);
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
      const base64 = asset.base64 ?? await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      setPreview(asset.uri);
      const res = await identifyPart(base64, mode);
      setResult(res);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not process image');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setPreview(null); setResult(null); };

  const search = () => {
    if (!result?.partNumber) return;
    router.replace({ pathname: '/(tabs)', params: { query: result.partNumber } });
  };

  const confidenceColor = { high: '#16a34a', medium: '#d97706', low: '#dc2626' }[result?.confidence ?? 'low'];

  // Preview + result screen
  if (preview) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={reset} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Part Identified</Text>
          <View style={{ width: 32 }} />
        </View>

        <Image source={{ uri: preview }} style={s.previewImage} resizeMode="cover" />

        {loading && (
          <View style={s.analyzingBox}>
            <ActivityIndicator color="#1e40af" />
            <Text style={s.analyzingText}>Analyzing with AI...</Text>
          </View>
        )}

        {!loading && result && (
          <View style={s.resultBox}>
            <View style={s.confidenceRow}>
              <Ionicons name="checkmark-circle" size={16} color={confidenceColor} />
              <Text style={[s.confidenceText, { color: confidenceColor }]}>
                {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)} confidence
              </Text>
            </View>

            {result.manufacturer ? (
              <Text style={s.manufacturer}>{result.manufacturer}</Text>
            ) : null}

            <Text style={s.partNumber}>{result.partNumber || 'Part number not found'}</Text>

            {result.description ? (
              <Text style={s.description} numberOfLines={3}>{result.description}</Text>
            ) : null}

            <View style={s.actionRow}>
              <TouchableOpacity style={s.retakeBtn} onPress={reset}>
                <Ionicons name="camera-outline" size={18} color="#1e40af" />
                <Text style={s.retakeBtnText}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.searchBtn, !result.partNumber && { opacity: 0.4 }]}
                onPress={search}
                disabled={!result.partNumber}
              >
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={s.searchBtnText}>Search This Part</Text>
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
          <Ionicons name="pricetag-outline" size={16} color={mode === 'label' ? '#fff' : '#93c5fd'} />
          <Text style={[s.modeBtnText, mode === 'label' && { color: '#fff' }]}>Scan Label</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeBtn, mode === 'part' && s.modeBtnActive]}
          onPress={() => setMode('part')}
        >
          <Ionicons name="cube-outline" size={16} color={mode === 'part' ? '#fff' : '#93c5fd'} />
          <Text style={[s.modeBtnText, mode === 'part' && { color: '#fff' }]}>Identify Part</Text>
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
          <Ionicons name="images-outline" size={26} color="#fff" />
          <Text style={s.galleryBtnText}>Library</Text>
        </TouchableOpacity>

        {loading
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1e40af', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  // Permission
  permBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12, backgroundColor: '#f9fafb' },
  permTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  permSub: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  permBtn: { backgroundColor: '#1e40af', borderRadius: 10, paddingHorizontal: 32, paddingVertical: 14, marginTop: 8 },
  permBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Mode toggle
  modeRow: { flexDirection: 'row', backgroundColor: '#1e3a8a', paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#3b82f6' },
  modeBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  modeBtnText: { color: '#93c5fd', fontWeight: '600', fontSize: 14 },

  // Camera
  camera: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 },
  frame: { width: 280, height: 180, position: 'relative' },
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
  analyzingBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, backgroundColor: '#fff' },
  analyzingText: { fontSize: 16, color: '#374151', fontWeight: '600' },
  resultBox: { flex: 1, backgroundColor: '#fff', padding: 20, gap: 8 },
  confidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  confidenceText: { fontSize: 13, fontWeight: '600' },
  manufacturer: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  partNumber: { fontSize: 28, fontWeight: '800', color: '#111827' },
  description: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 'auto', paddingTop: 16 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: '#1e40af', borderRadius: 10, padding: 14, flex: 1 },
  retakeBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 15 },
  searchBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1e40af', borderRadius: 10, padding: 14, flex: 2 },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
