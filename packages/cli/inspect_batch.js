import fs from 'fs';
import path from 'path';

const batchFile = "C:/Users/brian/.stoked/batch-data/items-batch_67f1b644b50881908bfe8f37a454b594.json";
const batch = JSON.parse(fs.readFileSync(batchFile));

console.log("Batch ID:", batch.id);
console.log("Has filePathIndices:", !!batch.filePathIndices);
console.log("Items count:", batch.items.length);

if (batch.items.length > 0) {
  console.log("Sample item:", JSON.stringify(batch.items[0], null, 2));
}

if (batch.filePathIndices) {
  console.log("filePathIndices count:", Object.keys(batch.filePathIndices).length);
  const entries = Object.entries(batch.filePathIndices);
  if (entries.length > 0) {
    console.log("Sample filePathIndices:", JSON.stringify(entries.slice(0, 2), null, 2));
  }
} 