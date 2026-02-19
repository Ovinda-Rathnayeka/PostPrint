import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
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
  return pool;
}

export async function testConnection(): Promise<boolean> {
  try {
    const db = getPool();
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
  const db = getPool();
  const [rows] = await db.execute(sql, params);
  return rows;
}
