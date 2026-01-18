import { InferNestedFieldReference } from "../elements/fieldReference";
import {
  AnyLiteral,
  LiteralOrFieldReferenceInferringTo,
} from "../elements/literals";
import { Expression } from "../elements/expressions";
import { Document, Prettify } from "../utils/core";

export type AggregatorFunction<Schema extends Document> =
  | {
      $sum: LiteralOrFieldReferenceInferringTo<Schema, number>;
    }
  | {
      $avg: LiteralOrFieldReferenceInferringTo<Schema, number>;
    }
  | {
      $min:
        | LiteralOrFieldReferenceInferringTo<Schema, number>
        | LiteralOrFieldReferenceInferringTo<Schema, Date>;
    }
  | {
      $max:
        | LiteralOrFieldReferenceInferringTo<Schema, number>
        | LiteralOrFieldReferenceInferringTo<Schema, Date>;
    }
  | {
      $count: {};
    }
  | {
      $push: LiteralOrFieldReferenceInferringTo<Schema, any>;
    }
  | {
      $addToSet: LiteralOrFieldReferenceInferringTo<Schema, any>;
    }
  | {
      $first: LiteralOrFieldReferenceInferringTo<Schema, any>;
    }
  | {
      $last: LiteralOrFieldReferenceInferringTo<Schema, any>;
    };

export type ResolveAggregatorFunction<Schema extends Document, Aggregator> =
  Aggregator extends { $sum: any } ? number
  : Aggregator extends { $avg: any } ? number
  : Aggregator extends { $min: infer A } ? InferNestedFieldReference<Schema, A>
  : Aggregator extends { $max: infer A } ? InferNestedFieldReference<Schema, A>
  : Aggregator extends { $count: any } ? number
  : Aggregator extends { $push: infer A } ?
    InferNestedFieldReference<Schema, A>[]
  : Aggregator extends { $addToSet: infer A } ?
    InferNestedFieldReference<Schema, A>[]
  : Aggregator extends { $first: infer A } ?
    InferNestedFieldReference<Schema, A>
  : Aggregator extends { $last: infer A } ? InferNestedFieldReference<Schema, A>
  : never;

export type GroupQuery<Schema extends Document> = {
  _id: AnyLiteral<Schema> | Expression<Schema> | null;
} & {
  [key: string]: AnyLiteral<Schema> | AggregatorFunction<Schema> | null;
};

export type ResolveGroupOutput<
  StartingDocs extends Document,
  G extends GroupQuery<StartingDocs>,
> = Prettify<
  {
    _id: InferNestedFieldReference<StartingDocs, G["_id"]>; // Infer out
  } & {
    [key in Exclude<keyof G, "_id">]: ResolveAggregatorFunction<
      StartingDocs,
      G[key]
    >;
  }
>;
