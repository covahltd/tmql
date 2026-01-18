#!/usr/bin/env bun

import fs from 'fs';
import path from 'path';

interface TypeEntry {
  id: number;
  symbolName?: string;
  typeName?: string;
  intrinsicName?: string;
  recursionId?: number;
  flags?: string[];
  display?: string;
  instantiatedType?: number;
  typeArguments?: number[];
  unionTypes?: number[];
  firstDeclaration?: {
    path: string;
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

// Read and parse the types.json file (NDJSON format)
const tracePath = path.join(process.cwd(), 'trace', 'types.json');
const content = fs.readFileSync(tracePath, 'utf-8');
const lines = content.trim().split('\n').filter(line => line.length > 0);

console.log(`Reading ${lines.length} type entries...`);

// Parse each line
const types: TypeEntry[] = [];
const instantiationCounts = new Map<string, number>();
const typeById = new Map<number, TypeEntry>();

for (const line of lines) {
  try {
    const entry = JSON.parse(line) as TypeEntry;
    types.push(entry);
    typeById.set(entry.id, entry);

    // Create a meaningful key for tracking
    let key = '';

    if (entry.symbolName) {
      key = `Symbol:${entry.symbolName}`;
    } else if (entry.display) {
      key = `Display:${entry.display}`;
    } else if (entry.intrinsicName) {
      key = `Intrinsic:${entry.intrinsicName}`;
    } else if (entry.instantiatedType) {
      const parent = typeById.get(entry.instantiatedType);
      if (parent?.symbolName) {
        key = `Instantiation:${parent.symbolName}<...>`;
      } else {
        key = `Instantiation:Type#${entry.instantiatedType}`;
      }
    } else if (entry.flags?.includes('Union')) {
      key = `Union(${entry.unionTypes?.length || 0} types)`;
    } else if (entry.flags?.includes('Object')) {
      key = `Object#${entry.id}`;
    } else {
      key = `Type#${entry.id}`;
    }

    instantiationCounts.set(key, (instantiationCounts.get(key) || 0) + 1);
  } catch (e) {
    console.error(`Error parsing line: ${e}`);
  }
}

// Convert to sorted array
const typeStats = Array.from(instantiationCounts.entries())
  .map(([key, count]) => ({ name: key, count }))
  .sort((a, b) => b.count - a.count);

// Calculate statistics
const totalInstantiations = types.length;
const uniqueTypes = typeStats.length;
const avgInstantiations = totalInstantiations / uniqueTypes;

console.log('='.repeat(80));
console.log('TypeScript Type Performance Analysis');
console.log('='.repeat(80));
console.log();

console.log('📊 OVERALL STATISTICS:');
console.log(`  Total type entries: ${totalInstantiations.toLocaleString()}`);
console.log(`  Unique type patterns: ${uniqueTypes.toLocaleString()}`);
console.log(`  Average occurrences per pattern: ${avgInstantiations.toFixed(2)}`);
console.log();

console.log('🔥 TOP 30 MOST FREQUENT TYPE PATTERNS:');
console.log('-'.repeat(100));
console.log('Rank | Count    | Type Pattern');
console.log('-'.repeat(100));

for (let i = 0; i < Math.min(30, typeStats.length); i++) {
  const stat = typeStats[i];
  if (!stat) continue;
  const percentage = ((stat.count / totalInstantiations) * 100).toFixed(2);
  const name = stat.name.length > 70 ? stat.name.substring(0, 67) + '...' : stat.name;

  console.log(
    `${String(i + 1).padStart(4)} | ` +
    `${stat.count.toLocaleString().padStart(8)} | ` +
    `${name} (${percentage}%)`
  );
}

console.log();
console.log('🔍 PROJECT-SPECIFIC TYPES (by symbol):');
console.log('-'.repeat(100));

// Look for specific symbols in our project
const projectSymbols = types.filter(t => {
  const path = t.firstDeclaration?.path || '';
  const symbol = t.symbolName || '';

  // Check if it's from our src directory
  if (path.includes('/src/') && !path.includes('node_modules')) {
    return true;
  }

  // Check for known type names
  const projectKeywords = [
    'MTAPipeline',
    'FieldSelector',
    'FieldReference',
    'GetFieldType',
    'InferFieldSelector',
    'PathsIncludingArrayIndexes',
    'HasNonNeverValue',
    'ApplySetUpdates',
    'MergeSetPlainObjects',
    'ExpandAllDotted',
    'FlattenDotSet',
    'ResolveSetOutput',
    'ResolveMatchOutput',
    'UnionToIntersection',
    'RemoveNeverFields',
    'Speaker',
    'Attendee',
    'Person'
  ];

  return projectKeywords.some(keyword => symbol.includes(keyword));
});

// Group project symbols by name
const projectSymbolCounts = new Map<string, number>();
projectSymbols.forEach(t => {
  const key = t.symbolName || `Type#${t.id}`;
  projectSymbolCounts.set(key, (projectSymbolCounts.get(key) || 0) + 1);
});

const projectStats = Array.from(projectSymbolCounts.entries())
  .map(([key, count]) => ({ name: key, count }))
  .sort((a, b) => b.count - a.count);

console.log(`Found ${projectSymbols.length} project-specific type entries`);
console.log();

if (projectStats.length > 0) {
  for (let i = 0; i < Math.min(20, projectStats.length); i++) {
    const stat = projectStats[i];
    if (!stat) continue;
    console.log(`  ${stat.count.toLocaleString().padStart(8)}x | ${stat.name}`);
  }
} else {
  console.log('  No project-specific symbols found directly.');
  console.log('  Checking for complex types from src files...');

  // Alternative: Look at declarations from src files
  const srcTypes = types.filter(t =>
    t.firstDeclaration?.path.includes('/src/') &&
    !t.firstDeclaration?.path.includes('node_modules')
  );

  const srcPaths = new Map<string, number>();
  srcTypes.forEach(t => {
    const path = t.firstDeclaration!.path.replace(/^.*\/src\//, 'src/');
    srcPaths.set(path, (srcPaths.get(path) || 0) + 1);
  });

  const srcStats = Array.from(srcPaths.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);

  if (srcStats.length > 0) {
    console.log();
    console.log('  Types by source file:');
    srcStats.slice(0, 10).forEach(stat => {
      console.log(`    ${stat.count.toLocaleString().padStart(6)}x | ${stat.path}`);
    });
  }
}

// Analyze type flags
console.log();
console.log('📈 TYPE PATTERNS BY FLAGS:');
console.log('-'.repeat(100));

const flagCounts = new Map<string, number>();
types.forEach(t => {
  t.flags?.forEach(flag => {
    flagCounts.set(flag, (flagCounts.get(flag) || 0) + 1);
  });
});

const flagStats = Array.from(flagCounts.entries())
  .map(([flag, count]) => ({ flag, count }))
  .sort((a, b) => b.count - a.count);

console.log('Most common type flags:');
flagStats.slice(0, 10).forEach(stat => {
  const percentage = ((stat.count / totalInstantiations) * 100).toFixed(1);
  console.log(`  ${stat.count.toLocaleString().padStart(8)}x | ${stat.flag} (${percentage}%)`);
});

// Look for instantiation chains
console.log();
console.log('🔄 GENERIC INSTANTIATIONS:');
console.log('-'.repeat(100));

const instantiations = types.filter(t => t.instantiatedType !== undefined);
const instantiationTargets = new Map<number, number>();

instantiations.forEach(t => {
  instantiationTargets.set(t.instantiatedType!, (instantiationTargets.get(t.instantiatedType!) || 0) + 1);
});

const instantiationStats = Array.from(instantiationTargets.entries())
  .map(([typeId, count]) => {
    const type = typeById.get(typeId);
    return {
      name: type?.symbolName || type?.display || `Type#${typeId}`,
      count
    };
  })
  .sort((a, b) => b.count - a.count);

console.log(`Found ${instantiations.length} generic instantiations`);
console.log();
console.log('Most instantiated generic types:');
instantiationStats.slice(0, 10).forEach(stat => {
  console.log(`  ${stat.count.toLocaleString().padStart(8)}x | ${stat.name}`);
});

// Export report
const report = {
  statistics: {
    totalInstantiations,
    uniqueTypes,
    avgInstantiations,
    projectSpecificCount: projectSymbols.length
  },
  top30: typeStats.slice(0, 30).map(s => ({
    name: s.name,
    count: s.count
  })),
  flags: flagStats,
  instantiations: instantiationStats.slice(0, 20)
};

fs.writeFileSync('trace-analysis.json', JSON.stringify(report, null, 2));
console.log();
console.log('✅ Analysis complete! Full report saved to trace-analysis.json');