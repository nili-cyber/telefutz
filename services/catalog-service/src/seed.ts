import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const sample = [
  { name: "Ridge Line", description: "A crew chases a wildfire across three states.", genre: "Drama", releaseYear: 2024, posterUrl: "/posters/ridge-line.jpg", videoId: "ridge-line-master", isFree: true },
  { name: "Signal Loss", description: "A radio operator picks up a transmission that shouldn't exist.", genre: "Sci-Fi", releaseYear: 2023, posterUrl: "/posters/signal-loss.jpg", videoId: "signal-loss-master", isFree: true },
  { name: "Late Checkout", description: "Four strangers, one hotel, one very long night.", genre: "Thriller", releaseYear: 2025, posterUrl: "/posters/late-checkout.jpg", videoId: "late-checkout-master" },
  { name: "Corner Shop", description: "A decade in the life of a family-run bodega.", genre: "Drama", releaseYear: 2022, posterUrl: "/posters/corner-shop.jpg", videoId: "corner-shop-master" },
  { name: "Overtime", description: "A rec-league team chases a championship nobody asked for.", genre: "Comedy", releaseYear: 2024, posterUrl: "/posters/overtime.jpg", videoId: "overtime-master" },
];

async function main() {
  for (const t of sample) {
    const exists = await prisma.title.findFirst({ where: { name: t.name } });
    if (!exists) await prisma.title.create({ data: t });
  }
  console.log(`Seeded ${sample.length} titles (idempotent).`);
}

main().finally(() => prisma.$disconnect());
