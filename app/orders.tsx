import React from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth } from "@/lib/AuthContext";
import { getApiUrl } from "@/lib/query-client";

interface Order {
  id: number;
  billNo: string;
  billDate: string;
  amount: string;
  discount: string;
  subTotal: string;
  paytype: string;
  customer: string;
  servicecharge: string;
  user: string;
}

interface DailySummary {
  totalOrders: number;
  totalSales: number;
  totalDiscount: number;
  totalServiceCharge: number;
  cashTotal: number;
  cardTotal: number;
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const { data: orders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    queryFn: async () => {
      const url = new URL(`/api/orders?branch=${user?.branch || "1"}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: summary } = useQuery<DailySummary>({
    queryKey: ["/api/daily-summary"],
    queryFn: async () => {
      const url = new URL(`/api/daily-summary?branch=${user?.branch || "1"}`, getApiUrl());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Orders</Text>
        <Text style={styles.headerDate}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        </Text>
      </View>

      {summary ? (
        <View style={styles.summarySection}>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
              <Ionicons name="trending-up" size={22} color={Colors.light.primary} />
              <Text style={styles.summaryValue}>Rs. {summary.totalSales.toFixed(2)}</Text>
              <Text style={styles.summaryLabel}>Today's Sales</Text>
            </View>
            <View style={styles.summaryCard}>
              <Ionicons name="receipt" size={22} color={Colors.light.accent} />
              <Text style={styles.summaryValue}>{summary.totalOrders}</Text>
              <Text style={styles.summaryLabel}>Orders</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryMini}>
              <Ionicons name="cash" size={16} color={Colors.light.success} />
              <Text style={styles.summaryMiniLabel}>Cash</Text>
              <Text style={styles.summaryMiniValue}>Rs. {summary.cashTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryMini}>
              <Ionicons name="card" size={16} color={Colors.light.accent} />
              <Text style={styles.summaryMiniLabel}>Card</Text>
              <Text style={styles.summaryMiniValue}>Rs. {summary.cardTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryMini}>
              <Ionicons name="pricetag" size={16} color={Colors.light.danger} />
              <Text style={styles.summaryMiniLabel}>Discount</Text>
              <Text style={styles.summaryMiniValue}>Rs. {summary.totalDiscount.toFixed(2)}</Text>
            </View>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Recent Orders</Text>

      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.orderList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
        renderItem={({ item }) => {
          const payColor = item.paytype === "Cash" ? Colors.light.success : item.paytype === "Card" ? Colors.light.accent : Colors.light.primary;
          return (
            <Pressable
              style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.9 }]}
              onPress={() => router.push({ pathname: "/order-detail", params: { billNo: item.billNo } })}
            >
              <View style={styles.orderLeft}>
                <View style={[styles.orderIcon, { backgroundColor: payColor + "20" }]}>
                  <Ionicons
                    name={item.paytype === "Cash" ? "cash" : item.paytype === "Card" ? "card" : "wallet"}
                    size={20}
                    color={payColor}
                  />
                </View>
                <View>
                  <Text style={styles.orderBillNo}>{item.billNo}</Text>
                  <Text style={styles.orderDate}>
                    {new Date(item.billDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.orderAmount}>Rs. {Number(item.subTotal).toFixed(2)}</Text>
                <View style={[styles.payBadge, { backgroundColor: payColor + "20" }]}>
                  <Text style={[styles.payBadgeText, { color: payColor }]}>{item.paytype}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.light.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={Colors.light.textSecondary} />
              <Text style={styles.emptyTitle}>No Orders Today</Text>
              <Text style={styles.emptyText}>Orders will appear here once you start selling</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  headerDate: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginLeft: "auto",
  },
  summarySection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  summaryCardPrimary: {
    borderColor: Colors.light.primary + "30",
    backgroundColor: Colors.light.primary + "08",
  },
  summaryValue: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  summaryMini: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  summaryMiniLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  summaryMiniValue: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  orderList: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  orderCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  orderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  orderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  orderBillNo: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  orderDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  orderRight: {
    alignItems: "flex-end",
    gap: 4,
  },
  orderAmount: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  payBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  payBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
});
