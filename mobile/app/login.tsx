import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { login, register } from '../services/api';
import { THEME } from '../constants/theme';

export default function LoginScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) { Alert.alert('Error', 'Fill in all fields'); return; }
    setLoading(true);
    try {
      isLogin ? await login(email, password) : await register(email, password, name);
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.hero}>
        <Text style={s.logo}>⚙️</Text>
        <Text style={s.title}>Parts Finder</Text>
        <Text style={s.sub}>Industrial Parts Search Engine</Text>
      </View>
      <View style={s.form}>
        {!isLogin && <TextInput style={s.input} placeholder="Your name" placeholderTextColor={THEME.colors.placeholderText} value={name} onChangeText={setName} autoCapitalize="words" keyboardAppearance="dark" />}
        <TextInput style={s.input} placeholder="Email" placeholderTextColor={THEME.colors.placeholderText} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" keyboardAppearance="dark" />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor={THEME.colors.placeholderText} value={password} onChangeText={setPassword} secureTextEntry keyboardAppearance="dark" />
        <TouchableOpacity style={[s.btn, loading && s.btnDim]} onPress={submit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={s.toggle}>
          <Text style={s.toggleText}>{isLogin ? "No account? Register" : "Have an account? Sign In"}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background, justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '800', color: THEME.colors.textPrimary, marginBottom: 4 },
  sub: { fontSize: 14, color: THEME.colors.textSecondary },
  form: { backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 24, borderWidth: 1, borderColor: THEME.colors.border },
  input: { borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.input, padding: 14, marginBottom: 12, fontSize: 16, backgroundColor: THEME.colors.background, color: THEME.colors.textPrimary },
  btn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 16, alignItems: 'center', marginTop: 4 },
  btnDim: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  toggle: { alignItems: 'center', marginTop: 16 },
  toggleText: { color: THEME.colors.textSecondary, fontSize: 14 },
});
