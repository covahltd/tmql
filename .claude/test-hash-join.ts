/**
 * Hash Join Detection Test
 *
 * Tests whether MongoDB is using hash joins for $lookup operations.
 * Run with: bun run tsx .claude/test-hash-join.ts
 */

import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";

interface Order {
  _id: number;
  customerId: number;
  amount: number;
}

interface Customer {
  _id: number;
  name: string;
  tier: string;
}

async function testHashJoin() {
  console.log("🚀 Starting Hash Join Detection Test...\n");

  // Start MongoDB instance (uses default version from mongodb-memory-server)
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: "test",
    },
  });

  const uri = mongod.getUri();
  const version = await mongod.getVersion();
  console.log(`MongoDB started at: ${uri}`);
  console.log(`MongoDB version: ${version}`);

  // Verify version is 8.0+
  const majorVersion = parseInt(version.split(".")[0], 10);
  if (majorVersion < 8) {
    console.warn(`⚠️  Warning: MongoDB ${version} may not support all hash join features. Recommended: 8.0+`);
  } else {
    console.log(`✅ MongoDB ${version} supports hash joins and SBE $lookup\n`);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("test");

  try {
    // Create collections
    const orders = db.collection<Order>("orders");
    const customers = db.collection<Customer>("customers");

    // Clear any existing data
    await orders.deleteMany({});
    await customers.deleteMany({});

    // Insert customers (small collection - should be eligible for hash join)
    const customerDocs: Customer[] = [];
    for (let i = 0; i < 50; i++) {
      customerDocs.push({
        _id: i,
        name: `Customer ${i}`,
        tier: i % 3 === 0 ? "gold" : i % 3 === 1 ? "silver" : "bronze",
      });
    }
    await customers.insertMany(customerDocs);
    console.log(`✅ Inserted ${customerDocs.length} customers`);

    // Insert orders (many-to-one relationship with customers)
    const orderDocs: Order[] = [];
    for (let i = 0; i < 500; i++) {
      orderDocs.push({
        _id: i,
        customerId: i % 50, // References customers 0-49
        amount: Math.floor(Math.random() * 1000),
      });
    }
    await orders.insertMany(orderDocs);
    console.log(`✅ Inserted ${orderDocs.length} orders\n`);

    // Test 1: Basic $lookup with explain
    console.log("=".repeat(60));
    console.log("Test 1: Basic $lookup (no indexes on foreign collection)");
    console.log("=".repeat(60));

    const pipeline1 = [
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $limit: 10 },
    ];

    const explain1 = await db.command({
      explain: {
        aggregate: "orders",
        pipeline: pipeline1,
        cursor: {},
      },
      verbosity: "executionStats",
    });

    analyzeExplain(explain1, "Test 1");

    // Test 2: $lookup with allowDiskUse (required for hash join eligibility)
    console.log("\n" + "=".repeat(60));
    console.log("Test 2: $lookup with allowDiskUse: true");
    console.log("=".repeat(60));

    const explain2 = await db.command({
      explain: {
        aggregate: "orders",
        pipeline: pipeline1,
        cursor: {},
        allowDiskUse: true,
      },
      verbosity: "executionStats",
    });

    analyzeExplain(explain2, "Test 2");

    // Test 3: Add index on foreign collection (should prefer INLJ)
    console.log("\n" + "=".repeat(60));
    console.log("Test 3: $lookup WITH index on customers._id");
    console.log("=".repeat(60));

    // _id already has an index by default, but let's be explicit
    await customers.createIndex({ _id: 1 });

    const explain3 = await db.command({
      explain: {
        aggregate: "orders",
        pipeline: pipeline1,
        cursor: {},
        allowDiskUse: true,
      },
      verbosity: "executionStats",
    });

    analyzeExplain(explain3, "Test 3");

    // Test 4: $lookup on non-indexed field
    console.log("\n" + "=".repeat(60));
    console.log("Test 4: $lookup on non-indexed field (tier)");
    console.log("=".repeat(60));

    // Add tier field to orders for this test
    await orders.updateMany({}, [
      {
        $set: {
          tier: {
            $switch: {
              branches: [
                { case: { $lt: ["$amount", 300] }, then: "bronze" },
                { case: { $lt: ["$amount", 600] }, then: "silver" },
              ],
              default: "gold",
            },
          },
        },
      },
    ]);

    const pipeline4 = [
      {
        $lookup: {
          from: "customers",
          localField: "tier",
          foreignField: "tier",
          as: "sametiercustomers",
        },
      },
      { $limit: 10 },
    ];

    const explain4 = await db.command({
      explain: {
        aggregate: "orders",
        pipeline: pipeline4,
        cursor: {},
        allowDiskUse: true,
      },
      verbosity: "executionStats",
    });

    analyzeExplain(explain4, "Test 4");

    // Test 5: Check actual results work correctly
    console.log("\n" + "=".repeat(60));
    console.log("Test 5: Verify $lookup produces correct results");
    console.log("=".repeat(60));

    const results = await orders
      .aggregate([
        { $match: { _id: { $lt: 3 } } },
        {
          $lookup: {
            from: "customers",
            localField: "customerId",
            foreignField: "_id",
            as: "customer",
          },
        },
      ])
      .toArray();

    console.log(`Results for orders 0-2:`);
    for (const order of results) {
      console.log(
        `  Order ${order._id}: customerId=${order.customerId}, customer=${JSON.stringify(order.customer)}`
      );
    }

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("SUMMARY");
    console.log("=".repeat(60));
    console.log(`
MongoDB version: ${version}

Hash Join Requirements (MongoDB 6.0+):
  ✓ allowDiskUse: true (required for hash join eligibility)
  ✓ Foreign collection small enough:
    - < 10,000 documents (internalQueryCollectionMaxNoOfDocumentsToChooseHashJoin)
    - < 100MB data size (internalQueryCollectionMaxDataSizeBytesToChooseHashJoin)
  ✓ No suitable index on foreign field (otherwise INLJ is preferred)
  ✓ SBE engine enabled (default in MongoDB 8.0+)

Hash Join vs INLJ Decision:
  - If index exists on foreignField → INLJ (Index Nested Loop Join)
  - If no index + small collection + allowDiskUse → HashJoin
  - Otherwise → NestedLoopJoin (slowest)
`);
  } finally {
    await client.close();
    await mongod.stop();
    console.log("\n✅ Cleanup complete");
  }
}

function analyzeExplain(explain: any, testName: string) {
  const explainStr = JSON.stringify(explain, null, 2);

  // Look for join strategy indicators
  const hasHashJoin =
    explainStr.includes("HashJoin") || explainStr.includes("hash_lookup");
  const hasINLJ =
    explainStr.includes("IndexedLoopJoin") ||
    explainStr.includes("INDEXED_NESTED_LOOP");
  const hasNLJ =
    explainStr.includes("NestedLoopJoin") ||
    explainStr.includes("NESTED_LOOP") ||
    explainStr.includes("$lookup");
  const hasSBE =
    explainStr.includes("slots") || explainStr.includes("slotBasedPlan");

  console.log(`\n${testName} Results:`);
  console.log(`  SBE Engine: ${hasSBE ? "✅ Yes" : "❌ No (Classic engine)"}`);
  console.log(`  Hash Join: ${hasHashJoin ? "✅ Yes" : "❌ No"}`);
  console.log(`  Index Nested Loop Join: ${hasINLJ ? "✅ Yes" : "❌ No"}`);
  console.log(
    `  Nested Loop Join: ${hasNLJ && !hasHashJoin && !hasINLJ ? "✅ Yes" : "❌ No"}`
  );

  // Look for EQ_LOOKUP stage and strategy
  const eqLookupMatch = explainStr.match(/"strategy"\s*:\s*"(\w+)"/);
  if (eqLookupMatch) {
    console.log(`  EQ_LOOKUP Strategy: ${eqLookupMatch[1]}`);
  }

  // Print relevant portion of explain for debugging
  if (
    explain.stages &&
    explain.stages[0] &&
    explain.stages[0].$cursor &&
    explain.stages[0].$cursor.queryPlanner
  ) {
    const qp = explain.stages[0].$cursor.queryPlanner;
    if (qp.winningPlan) {
      console.log(`  Winning Plan Stage: ${qp.winningPlan.stage || "N/A"}`);
    }
  }

  // Check for $lookup in stages (classic engine indicator)
  if (explain.stages) {
    for (const stage of explain.stages) {
      if (stage.$lookup) {
        console.log(`  Classic $lookup detected (not pushed to SBE)`);
      }
    }
  }

  // Dump key parts of explain for debugging
  console.log(`\n  --- Explain Debug Info ---`);

  // Find and print the lookup-related stages
  function findLookupInfo(obj: any, path: string = ""): void {
    if (!obj || typeof obj !== "object") return;

    // Check for strategy field
    if (obj.strategy) {
      console.log(`  [${path}] strategy: ${obj.strategy}`);
    }

    // Check for stage field
    if (obj.stage && typeof obj.stage === "string") {
      const stage = obj.stage;
      if (stage.includes("LOOKUP") || stage.includes("JOIN") || stage.includes("EQ_LOOKUP")) {
        console.log(`  [${path}] stage: ${stage}`);
      }
    }

    // Check for queryPlanner.winningPlan
    if (obj.queryPlanner?.winningPlan) {
      console.log(`  [${path}] winningPlan.stage: ${obj.queryPlanner.winningPlan.stage}`);
    }

    // Recurse
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object" && obj[key] !== null) {
        findLookupInfo(obj[key], path ? `${path}.${key}` : key);
      }
    }
  }

  findLookupInfo(explain);
  console.log(`  ----------------------------`);
}

// Run the test
testHashJoin().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
