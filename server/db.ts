import mysql from "mysql2/promise";
import * as crypto from "node:crypto";

let authPool: mysql.Pool | null = null;
let posPool: mysql.Pool | null = null;

const AES_KEY_B64 = process.env.AES_KEY_B64 || "";

export function getAuthPool(): mysql.Pool {
  if (!authPool) {
    authPool = mysql.createPool({
      host: process.env.AUTH_MYSQL_HOST || "localhost",
      port: parseInt(process.env.AUTH_MYSQL_PORT || "3306"),
      user: process.env.AUTH_MYSQL_USER || "root",
      password: process.env.AUTH_MYSQL_PASSWORD || "",
      database: process.env.AUTH_MYSQL_DATABASE || "",
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: 10000,
    });
  }
  return authPool;
}

export async function authQuery(sql: string, params?: any[]): Promise<any> {
  const db = getAuthPool();
  const [rows] = await db.execute(sql, params);
  return rows;
}

export function decryptAesGcm(encryptedB64: string): string {
  if (!encryptedB64 || !AES_KEY_B64) return encryptedB64;
  try {
    const keyBuffer = Buffer.from(AES_KEY_B64, "base64");
    const encryptedBuffer = Buffer.from(encryptedB64, "base64");
    const nonce = encryptedBuffer.subarray(0, 12);
    const ciphertextWithTag = encryptedBuffer.subarray(12);
    const tagLength = 16;
    const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - tagLength);
    const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - tagLength);
    const decipher = crypto.createDecipheriv("aes-256-gcm", keyBuffer, nonce);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("AES-GCM decryption error:", error);
    return encryptedB64;
  }
}

export function setPosPool(host: string, port: number, user: string, password: string, database: string): mysql.Pool {
  if (posPool) {
    posPool.end().catch(() => {});
  }
  posPool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
  });
  return posPool;
}

export function getPosPool(): mysql.Pool | null {
  return posPool;
}

export function getPool(): mysql.Pool {
  if (posPool) return posPool;
  if (!posPool) {
    posPool = mysql.createPool({
      host: process.env.MYSQL_HOST || "localhost",
      port: parseInt(process.env.MYSQL_PORT || "3306"),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "pos_db",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 10000,
    });
  }
  return posPool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const db = getPosPool() || getPool();
    const conn = await db.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch (error) {
    console.error("MySQL connection failed:", error);
    return false;
  }
}

export async function query(sql: string, params?: any[]): Promise<any> {
  const db = getPosPool() || getPool();
  const [rows] = await db.execute(sql, params);
  return rows;
}
