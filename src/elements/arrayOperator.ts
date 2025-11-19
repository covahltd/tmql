import { FieldReferencesThatInferTo } from "./fieldReference";

export type ArrayOperation<Schema, ArrayElement = unknown> = {
  $first:
    | Array<ArrayElement>
    | FieldReferencesThatInferTo<Schema, Array<ArrayElement>>;
};

export type InferArrayOperation<O> =
  O extends ArrayOperation<infer Schema, infer ArrayElement> ?
    O["$first"] extends Array<ArrayElement> ? ArrayElement
    : O["$first"] extends (
      FieldReferencesThatInferTo<Schema, Array<ArrayElement>>
    ) ?
      ArrayElement
    : O["$first"] extends any ? O["$first"][number]
    : O & { error: 1 }
  : O & { error: 2 };
