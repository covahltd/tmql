import { ObjectId } from "mongodb";
import { NoDollarString } from "../utils/core";
import { FieldReferencesThatInferTo } from "./fieldReference";

export type LiteralOrFieldReferenceInferringTo<Schema, T> =
  | T
  | FieldReferencesThatInferTo<Schema, T>;

type Primitive = boolean | number | Date | NoDollarString | ObjectId;

export type ResolveToPrimitive<Schema> =
  Schema extends unknown ?
    Primitive | FieldReferencesThatInferTo<Schema, Primitive | string>
  : never;

export type ResolveToPrimitiveObjectArray<Schema> =
  ResolveToPrimitiveObject<Schema>[];

export type ResolveToPrimitiveArray<Schema> = ResolveToPrimitive<Schema>[];

export type ResolveToPrimitiveObject<Schema> = {
  [K in string]:
    | ResolveToPrimitive<Schema>
    | ResolveToPrimitiveArray<Schema>
    | ResolveToPrimitiveObject<Schema>
    | ResolveToPrimitiveObjectArray<Schema>;
};

export type ArrayLiterals<Schema> =
  | LiteralOrFieldReferenceInferringTo<Schema, boolean>[]
  | LiteralOrFieldReferenceInferringTo<Schema, number>[]
  | LiteralOrFieldReferenceInferringTo<Schema, Date>[]
  | (NoDollarString | FieldReferencesThatInferTo<Schema, string>)[];

export type ObjectLiteral<Schema> = {
  [K in NoDollarString]:
    | ResolveToPrimitive<Schema>
    | ArrayLiterals<Schema>
    | ObjectLiteral<Schema>;
};

export type AnyLiteral<Schema> =
  | ResolveToPrimitive<Schema>
  | ArrayLiterals<Schema>
  | ObjectLiteral<Schema>;
