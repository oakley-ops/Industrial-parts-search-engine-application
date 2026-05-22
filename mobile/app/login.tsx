import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { login, register } from '../services/api';

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
        {!isLogin && <TextInput style={s.input} placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />}
        <TextInput style={s.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={s.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
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
  container: { flex: 1, backgroundColor: '#1e40af', justifyContent: 'center', padding: 24 },
  hero: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 4 },
  sub: { fontSize: 14, color: '#93c5fd' },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 16 },
  btn: { backgroundColor: '#1e40af', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 },
  btnDim: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  toggle: { alignItems: 'center', marginTop: 16 },
  toggleText: { color: '#6b7280', fontSize: 14 },
});
