import { TMPipeline } from "../pipeline/TMPipeline";
import { Document } from "../utils/core";

export class TMCollection<Docs extends Document> {
  constructor(private collectionName: string) {}

  getCollectionName(): string {
    return this.collectionName;
  }

  aggregate(): TMPipeline<Docs, Docs> {
    return new TMPipeline<Docs, Docs>();
  }
}

export type InferCollectionType<Collection extends TMCollection<any>> =
  Collection extends TMCollection<infer Docs> ? Docs : never;
