import { Project } from 'ts-morph';

// Parse CLI arguments
const args = process.argv.slice(2);
const variableName = args[0];
const fileName = args[1] || 'examples/index.ts';

if (!variableName) {
  console.log('Usage: bun run tsx .claude/inspect-types.ts <variableName> [fileName]');
  console.log('Example: bun run tsx .claude/inspect-types.ts OwnersPipeline');
  console.log('Example: bun run tsx .claude/inspect-types.ts PersonPipeline examples/index.ts');
  process.exit(1);
}

const project = new Project({ tsConfigFilePath: './tsconfig.json' });
project.addSourceFilesAtPaths('.claude/*.ts'); // Add .claude files explicitly
const file = project.getSourceFile(fileName);

if (!file) {
  console.log(`Could not find ${fileName}`);
  process.exit(1);
}

console.log(`=== Type Inspection for ${variableName} in ${fileName} ===`);

// Try to find as variable declaration first
let declaration = file.getVariableDeclaration(variableName);
let isTypeAlias = false;
let isFunction = false;

// If not found as variable, try as type alias
if (!declaration) {
  const typeAlias = file.getTypeAlias(variableName);
  if (typeAlias) {
    declaration = typeAlias as any;
    isTypeAlias = true;
  }
}

// If still not found, try as function declaration
if (!declaration) {
  const functionDeclaration = file.getFunction(variableName);
  if (functionDeclaration) {
    declaration = functionDeclaration as any;
    isFunction = true;
  }
}

if (!declaration) {
  console.log(`Variable/Type/Function '${variableName}' not found in ${fileName}`);
  
  // Show available declarations for debugging
  console.log('\nAvailable variable declarations:');
  file.getVariableDeclarations().forEach(v => console.log(`  - ${v.getName()}`));
  
  console.log('\nAvailable type aliases:');
  file.getTypeAliases().forEach(t => console.log(`  - ${t.getName()}`));
  
  console.log('\nAvailable functions:');
  file.getFunctions().forEach(f => console.log(`  - ${f.getName()}`));
  
  process.exit(1);
}

// Display the type information
console.log(`${variableName} type:`);
const typeText = declaration.getType().getText();
// Pretty print if it's a complex type
if (typeText.length > 200) {
  // Try to format it better
  const formatted = typeText
    .replace(/; /g, ';\n  ')
    .replace(/\{ /g, '{\n  ')
    .replace(/ \}/g, '\n}');
  console.log(formatted);
} else {
  console.log(typeText);
}
console.log('');

// If it's a pipeline variable, also check getPipeline method type
if (!isTypeAlias && !isFunction && 'getType' in declaration) {
  const type = declaration.getType();
  const getPipelineMethod = type.getProperty('getPipeline');
  
  if (getPipelineMethod) {
    console.log(`${variableName}.getPipeline() return type:`);
    const typeChecker = project.getTypeChecker();
    const methodType = typeChecker.getTypeOfSymbolAtLocation(getPipelineMethod, declaration);
    const returnType = methodType.getCallSignatures()[0]?.getReturnType().getText();
    console.log(returnType || 'No return type');
    console.log('');
  }
}

// Get diagnostics for the specific file
const diagnostics = project.getPreEmitDiagnostics().filter(d => 
  d.getSourceFile()?.getFilePath().includes(fileName)
);

if (diagnostics.length > 0) {
  console.log('=== TypeScript Diagnostics ===');
  diagnostics.forEach(d => {
    console.log(`Line ${d.getLineNumber()}: ${d.getMessageText()}`);
  });
} else {
  console.log(`No TypeScript errors found in ${fileName}`);
}