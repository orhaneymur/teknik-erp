import 'dotenv/config';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL ortam değişkeni tanımlı değil.');
}

const adapter = new PrismaMariaDb(connectionString);

/*
 * Etkilesimli islem (interactive transaction) zaman asimi.
 *
 * Prisma varsayilani 5 saniyedir. Kalabalik fisler bu sureye sigmiyor:
 * 249 kalemlik bir on siparisi satisa cevirmek kalem basina stok, FIFO
 * katmani ve maliyet yazmak icin ~6 sorgu atar; 1500 sorgu 5 saniyeyi
 * asinca islem GERI ALINIR ve kullanici "expired transaction" hatasi
 * gorur (18 Eylul 2026, fis 260915094213).
 *
 * maxWait: havuzdan baglanti beklerken tahammul.
 */
export const prisma = new PrismaClient({
  adapter,
  transactionOptions: { timeout: 120_000, maxWait: 15_000 },
});
