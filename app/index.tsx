import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/lib/AuthContext";
import { apiRequest } from "@/lib/query-client";
import Colors from "@/constants/colors";
import * as Haptics from "expo-haptics";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { user, isLoading, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logging, setLogging] = useState(false);
  const [error, setError] = useState("");
  const [showInactiveModal, setShowInactiveModal] = useState(false);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/pos");
    }
  }, [isLoading, user]);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password");
      return;
    }
    setError("");
    setLogging(true);
    try {
      const res = await apiRequest("POST", "/api/login", { email: email.trim(), password: password.trim() });
      const data = await res.json();
      await login(data);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace("/pos");
    } catch (err: any) {
      if (err.message?.includes("403")) {
        setShowInactiveModal(true);
      } else {
        const msg = err.message?.includes("401")
          ? "Invalid email or password"
          : err.message?.includes("500")
          ? "Cannot connect to database. Check settings."
          : "Login failed. Please try again.";
        setError(msg);
      }
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLogging(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  if (user) return null;

  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top + webTopInset, paddingBottom: insets.bottom + webBottomInset }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.logoSection}>
        <View style={styles.logoCircle}>
          <Ionicons name="receipt" size={40} color="#FFF" />
        </View>
        <Text style={styles.appName}>POS System</Text>
        <Text style={styles.appSubtitle}>Restaurant Point of Sale</Text>
      </View>

      <View style={styles.formSection}>
        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={Colors.light.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inputGroup}>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color={Colors.light.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.light.textSecondary}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              testID="email-input"
            />
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color={Colors.light.textSecondary} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={Colors.light.textSecondary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              testID="password-input"
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.light.textSecondary} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.loginBtn, pressed && styles.loginBtnPressed, logging && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={logging}
          testID="login-button"
        >
          {logging ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.loginBtnText}>Sign In</Text>
          )}
        </Pressable>
      </View>
      <Modal
        visible={showInactiveModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInactiveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="lock-closed" size={36} color="#FFF" />
            </View>
            <Text style={styles.modalTitle}>Account Inactive</Text>
            <Text style={styles.modalMessage}>
              Your account is currently deactivated. Please contact your service provider to restore access.
            </Text>
            <View style={styles.modalDivider} />
            <View style={styles.modalContactRow}>
              <Ionicons name="call-outline" size={18} color={Colors.light.primary} />
              <Text style={styles.modalContactText}>Contact Support</Text>
            </View>
            <Pressable
              style={styles.modalBtn}
              onPress={() => setShowInactiveModal(false)}
            >
              <Text style={styles.modalBtnText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  logoSection: {
    alignItems: "center",
    marginBottom: 48,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.light.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  appSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  formSection: {
    width: "100%",
    maxWidth: 380,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.danger,
    flex: 1,
  },
  inputGroup: {
    gap: 12,
    marginBottom: 24,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 14,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    height: "100%",
  },
  eyeBtn: {
    padding: 4,
  },
  loginBtn: {
    backgroundColor: Colors.light.primary,
    borderRadius: 14,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    width: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FF6B6B",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#333",
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  modalDivider: {
    width: "100%",
    height: 1,
    backgroundColor: "#EEE",
    marginBottom: 16,
  },
  modalContactRow: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  modalContactText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primary,
  },
  modalBtn: {
    backgroundColor: Colors.light.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 48,
  },
  modalBtnText: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
