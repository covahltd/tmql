/**
 * Local MongoDB Testing Utility
 *
 * This utility provides an in-memory MongoDB instance for testing aggregation pipelines.
 * It can be used in two ways:
 *
 * 1. Run directly for interactive testing:
 *    bun run tsx .claude/local-mongodb.ts
 *
 * 2. Import in test files:
 *    import { setupLocalMongo } from './.claude/local-mongodb';
 *    const { db, cleanup } = await setupLocalMongo();
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db, Collection } from "mongodb";

// Type definitions matching our examples
type Person = {
  name: string;
  email: string;
  date_of_birth: Date;
};

type Speaker = Person & {
  type: "speaker";
  bio?: string;
};

type Attendee = Person & {
  type: "attendee";
  interests: ("programming" | "design" | "marketing" | "business" | "other")[];
};

type PersonDocument = Speaker | Attendee;

interface LocalMongoInstance {
  client: MongoClient;
  db: Db;
  uri: string;
  collection: Collection<PersonDocument>;
  seedTestData: () => Promise<void>;
  testPipeline: (pipeline: any[]) => Promise<any[]>;
  cleanup: () => Promise<void>;
}

/**
 * Sets up an in-memory MongoDB instance with a connected client
 */
export async function setupLocalMongo(): Promise<LocalMongoInstance> {
  console.log("🚀 Starting in-memory MongoDB instance...");

  // Start MongoDB instance
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: "test",
    },
  });

  const uri = mongod.getUri();
  console.log(`✅ MongoDB started at: ${uri}`);

  // Connect client
  const client = new MongoClient(uri);
  await client.connect();
  console.log("✅ Client connected");

  const db = client.db("test");
  const collection = db.collection<PersonDocument>("people");

  /**
   * Seeds the database with test data
   */
  async function seedTestData() {
    console.log("\n📊 Seeding test data...");

    // Clear existing data
    await collection.deleteMany({});

    const testData: PersonDocument[] = [
      {
        name: "Alice Smith",
        email: "alice@example.com",
        date_of_birth: new Date("1990-05-15"),
        type: "speaker",
        bio: "Technology evangelist and conference speaker",
      },
      {
        name: "Bob Jones",
        email: "bob@example.com",
        date_of_birth: new Date("1985-08-22"),
        type: "attendee",
        interests: ["programming", "design"],
      },
      {
        name: "Charlie Brown",
        email: "charlie@example.com",
        date_of_birth: new Date("1992-12-03"),
        type: "attendee",
        interests: ["business", "marketing"],
      },
      {
        name: "Diana Prince",
        email: "diana@example.com",
        date_of_birth: new Date("1988-11-20"),
        type: "speaker",
        bio: "UX designer and accessibility advocate",
      },
      {
        name: "Eve Davis",
        email: "eve@example.com",
        date_of_birth: new Date("1995-03-08"),
        type: "attendee",
        interests: ["programming", "business", "other"],
      },
    ];

    await collection.insertMany(testData);
    console.log(`✅ Inserted ${testData.length} documents`);
  }

  /**
   * Tests an aggregation pipeline against the collection
   */
  async function testPipeline(pipeline: any[]) {
    console.log("\n🔍 Running aggregation pipeline:");
    console.log(JSON.stringify(pipeline, null, 2));

    const results = await collection.aggregate(pipeline).toArray();

    console.log(`\n📊 Results (${results.length} documents):`);
    console.log(JSON.stringify(results, null, 2));

    return results;
  }

  /**
   * Cleans up and stops the MongoDB instance
   */
  async function cleanup() {
    console.log("\n🧹 Cleaning up...");
    await client.close();
    await mongod.stop();
    console.log("✅ MongoDB stopped");
  }

  return {
    client,
    db,
    uri,
    collection,
    seedTestData,
    testPipeline,
    cleanup,
  };
}

/**
 * Example usage when run directly
 */
async function main() {
  const mongo = await setupLocalMongo();

  try {
    // Seed test data
    await mongo.seedTestData();

    // Example 1: Simple match
    console.log("\n" + "=".repeat(60));
    console.log("Example 1: Match attendees");
    console.log("=".repeat(60));
    await mongo.testPipeline([{ $match: { type: "attendee" } }]);

    // Example 2: Match with $set
    console.log("\n" + "=".repeat(60));
    console.log("Example 2: Match and add welcome message");
    console.log("=".repeat(60));
    await mongo.testPipeline([
      { $match: { email: "bob@example.com" } },
      { $set: { welcome_message: "Hello, Bob!" } },
    ]);

    // Example 3: Complex match with interests
    console.log("\n" + "=".repeat(60));
    console.log("Example 3: Match by interests");
    console.log("=".repeat(60));
    await mongo.testPipeline([
      { $match: { interests: "programming" } },
      {
        $set: {
          category: "developer",
          contact: { email: "$email", name: "$name" },
        },
      },
    ]);

    // Example 4: Test $set with nested fields
    console.log("\n" + "=".repeat(60));
    console.log("Example 4: Nested field operations");
    console.log("=".repeat(60));
    await mongo.testPipeline([
      { $match: { type: "speaker" } },
      {
        $set: {
          "profile.name": "$name",
          "profile.bio": "$bio",
          modified: new Date(),
        },
      },
    ]);

    // Example 5: Union type narrowing test
    console.log("\n" + "=".repeat(60));
    console.log("Example 5: Union type narrowing (interests field)");
    console.log("=".repeat(60));
    await mongo.testPipeline([
      { $match: { interests: { $exists: true } } },
      { $set: { is_attendee: true } },
    ]);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongo.cleanup();
  }
}

// Run main if executed directly (Bun-specific check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
