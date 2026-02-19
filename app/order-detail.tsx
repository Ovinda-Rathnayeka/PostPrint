import React from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface OrderItem {
  icode: string;
  iname: string;
  quantity: number;
  uprice: string;
  amount: string;
}

interface OrderSummary {
  billNo: string;
  billDate: string;
  amount: string;
  discount: string;
  subTotal: string;
  paytype: string;
  customer: string;
  servicecharge: string;
  user: string;
  branch: string;
}

export default function OrderDetailScreen() {
  const { billNo } = useLocalSearchParams<{ billNo: string }>();
  const insets = useSafeAreaInsets();
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const { data, isLoading } = useQuery({
    queryKey: ["/api/order-details", billNo],
    queryFn: async () => {
      const url = new URL(`/api/order-details/${billNo}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ items: OrderItem[]; summary: OrderSummary | null }>;
    },
    enabled: !!billNo,
  });

  if (isLoading || !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.primary} />
      </View>
    );
  }

  const { items, summary } = data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + webBottomInset + 20 }}
      showsVerticalScrollIndicator={false}
    >
      {summary && (
        <View style={styles.headerCard}>
          <View style={styles.billNoRow}>
            <Text style={styles.billNoLabel}>Bill No</Text>
            <Text style={styles.billNoValue}>{summary.billNo}</Text>
          </View>
          <View style={styles.headerRow}>
            <View style={styles.headerItem}>
              <Ionicons name="calendar" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.headerItemText}>
                {new Date(summary.billDate).toLocaleDateString()}
              </Text>
            </View>
            <View style={styles.headerItem}>
              <Ionicons name="time" size={16} color={Colors.light.textSecondary} />
              <Text style={styles.headerItemText}>
                {new Date(summary.billDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Text>
            </View>
            <View style={[styles.payBadge, { backgroundColor: summary.paytype === "Cash" ? Colors.light.success + "20" : Colors.light.accent + "20" }]}>
              <Text style={[styles.payBadgeText, { color: summary.paytype === "Cash" ? Colors.light.success : Colors.light.accent }]}>
                {summary.paytype}
              </Text>
            </View>
          </View>
        </View>
      )}

      <Text style={styles.sectionTitle}>Items</Text>
      <View style={styles.itemsCard}>
        <View style={styles.itemHeader}>
          <Text style={[styles.itemHeaderText, { flex: 2 }]}>Item</Text>
          <Text style={[styles.itemHeaderText, { flex: 0.5, textAlign: "center" }]}>Qty</Text>
          <Text style={[styles.itemHeaderText, { flex: 1, textAlign: "right" }]}>Price</Text>
          <Text style={[styles.itemHeaderText, { flex: 1, textAlign: "right" }]}>Amount</Text>
        </View>
        {items.map((item, idx) => (
          <View
            key={`${item.icode}-${idx}`}
            style={[styles.itemRow, idx === items.length - 1 && { borderBottomWidth: 0 }]}
          >
            <Text style={[styles.itemName, { flex: 2 }]} numberOfLines={2}>{item.iname}</Text>
            <Text style={[styles.itemQty, { flex: 0.5, textAlign: "center" }]}>{item.quantity}</Text>
            <Text style={[styles.itemPrice, { flex: 1, textAlign: "right" }]}>
              {Number(item.uprice).toFixed(2)}
            </Text>
            <Text style={[styles.itemAmount, { flex: 1, textAlign: "right" }]}>
              {Number(item.amount).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      {summary && (
        <>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryLine}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>Rs. {Number(summary.amount).toFixed(2)}</Text>
            </View>
            {Number(summary.servicecharge) > 0 && (
              <View style={styles.summaryLine}>
                <Text style={styles.summaryLabel}>Service Charge</Text>
                <Text style={styles.summaryValue}>Rs. {Number(summary.servicecharge).toFixed(2)}</Text>
              </View>
            )}
            {Number(summary.discount) > 0 && (
              <View style={styles.summaryLine}>
                <Text style={[styles.summaryLabel, { color: Colors.light.danger }]}>Discount</Text>
                <Text style={[styles.summaryValue, { color: Colors.light.danger }]}>
                  -Rs. {Number(summary.discount).toFixed(2)}
                </Text>
              </View>
            )}
            <View style={[styles.summaryLine, styles.grandTotalLine]}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={styles.grandTotalValue}>Rs. {Number(summary.subTotal).toFixed(2)}</Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.light.background,
  },
  headerCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  billNoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  billNoLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  billNoValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  headerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerItemText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  payBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: "auto",
  },
  payBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 10,
  },
  itemsCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  itemHeader: {
    flexDirection: "row",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    marginBottom: 4,
  },
  itemHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    textTransform: "uppercase" as const,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  itemName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  itemQty: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  itemPrice: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  itemAmount: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  summaryCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
  grandTotalLine: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: 8,
    paddingTop: 12,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  grandTotalValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.primary,
  },
});
