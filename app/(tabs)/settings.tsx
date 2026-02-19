import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { apiRequest } from "@/lib/query-client";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, logout } = useAuth();
  const [testing, setTesting] = useState(false);
  const [dbStatus, setDbStatus] = useState<"idle" | "connected" | "failed">("idle");
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await apiRequest("POST", "/api/test-connection");
      const data = await res.json();
      setDbStatus(data.success ? "connected" : "failed");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(
          data.success ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        );
      }
    } catch {
      setDbStatus("failed");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setTesting(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout().then(() => router.replace("/"));
    } else {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: () => logout().then(() => router.replace("/")),
        },
      ]);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.charAt(0)?.toUpperCase() || "U"}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.name || "User"}</Text>
            <Text style={styles.profileRole}>{user?.post || user?.userType || "Staff"}</Text>
            <Text style={styles.profileBranch}>Branch: {user?.branch || "1"}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Database Connection</Text>
        <View style={styles.section}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: "#E0F2FE" }]}>
                <Ionicons name="server" size={18} color={Colors.light.primary} />
              </View>
              <View>
                <Text style={styles.settingTitle}>MySQL Status</Text>
                <Text style={styles.settingSubtitle}>
                  {dbStatus === "connected"
                    ? "Connected successfully"
                    : dbStatus === "failed"
                    ? "Connection failed"
                    : "Tap to test connection"}
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    dbStatus === "connected"
                      ? Colors.light.success
                      : dbStatus === "failed"
                      ? Colors.light.danger
                      : Colors.light.textSecondary,
                },
              ]}
            />
          </View>

          <Pressable
            style={({ pressed }) => [styles.testBtn, pressed && { opacity: 0.9 }]}
            onPress={handleTestConnection}
            disabled={testing}
          >
            {testing ? (
              <ActivityIndicator size="small" color={Colors.light.primary} />
            ) : (
              <>
                <Feather name="zap" size={16} color={Colors.light.primary} />
                <Text style={styles.testBtnText}>Test Connection</Text>
              </>
            )}
          </Pressable>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={18} color={Colors.light.primary} />
            <Text style={styles.infoText}>
              To configure MySQL connection, update the environment variables: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE in your Replit Secrets tab.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          <Pressable style={styles.settingRow} onPress={handleLogout}>
            <View style={styles.settingLeft}>
              <View style={[styles.settingIcon, { backgroundColor: "#FEE2E2" }]}>
                <Ionicons name="log-out" size={18} color={Colors.light.danger} />
              </View>
              <Text style={[styles.settingTitle, { color: Colors.light.danger }]}>Sign Out</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.light.textSecondary} />
          </Pressable>
        </View>

        <Text style={styles.versionText}>POS System v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.surface,
    borderRadius: 18,
    padding: 18,
    gap: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.light.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  profileRole: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  profileBranch: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.light.primary,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  section: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  settingTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  settingSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  testBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.primary,
  },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    backgroundColor: Colors.light.primary + "08",
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  versionText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
});
