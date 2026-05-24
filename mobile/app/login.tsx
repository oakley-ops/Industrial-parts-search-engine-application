import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { login, register } from '../services/api';
import { theme } from '../constants/theme';

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
        {!isLogin && (
          <TextInput
            style={s.input}
            placeholder="Your name"
            placeholderTextColor={theme.colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        )}
        <TextInput
          style={s.input}
          placeholder="Email"
          placeholderTextColor={theme.colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={s.input}
          placeholder="Password"
          placeholderTextColor={theme.colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={[s.btn, loading && s.btnDim]} onPress={submit} disabled={loading}>
          {loading
            ? <ActivityIndicator color={theme.colors.white} />
            : <Text style={s.btnText}>{isLogin ? 'Sign In' : 'Create Account'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={s.toggle}>
          <Text style={s.toggleText}>
            {isLogin ? 'No account? ' : 'Have an account? '}
            <Text style={s.toggleLink}>{isLogin ? 'Register' : 'Sign In'}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  hero: { alignItems: 'center', marginBottom: 32 },
  logo: { fontSize: 64, marginBottom: 12 },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  sub: { fontSize: 14, color: theme.colors.primary },

  form: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: theme.colors.surfaceElevated,
    color: theme.colors.textPrimary,
  },
  btn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDim: { opacity: 0.6 },
  btnText: { color: theme.colors.white, fontSize: 16, fontWeight: '700' },
  toggle: { alignItems: 'center', marginTop: 16 },
  toggleText: { color: theme.colors.textMuted, fontSize: 14 },
  toggleLink: { color: theme.colors.secondary, fontWeight: '600' },
});
