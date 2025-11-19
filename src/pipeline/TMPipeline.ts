import { Document } from "../utils/core";
import { MatchQuery, ResolveMatchOutput } from "../stages/match";
import { ResolveSetOutput, SetQuery } from "../stages/set";
import { ResolveUnsetOutput, UnsetQuery } from "../stages/unset";
import {
  FieldPath,
  FieldPathsThatInferToForLookup,
} from "../elements/fieldReference";
import { InferCollectionType, TMCollection } from "../collection/TMCollection";
import { ResolveLookupOutput } from "../stages/lookup";
import { GetFieldType } from "../elements/fieldSelector";
import { GroupQuery, ResolveGroupOutput } from "../stages/group";
import { ProjectQuery, ResolveProjectOutput } from "../stages/project";
import {
  ReplaceRootQuery,
  ResolveReplaceRootOutput,
} from "../stages/replaceRoot";
import { ResolveUnionWithOutput } from "../stages/unionWith";

type PLFrom<D extends Document, O extends Document> = (
  p: TMPipeline<D, D>
) => TMPipeline<D, O>;
export class TMPipeline<
  StartingDocs extends Document = never,
  PreviousStageDocs extends Document = StartingDocs,
> {
  private pipeline: unknown[] = [];
  getPipeline(): PreviousStageDocs extends never ? never : unknown[] {
    return this.pipeline as PreviousStageDocs extends never ? never : unknown[];
  }

  constructor(pipeline: unknown[] = []) {
    this.pipeline = pipeline;
  }

  // Ability to use any aggregation stage(s) and manually type the output
  custom<CustomOutput extends Document>(pipelineStages: unknown[]) {
    return new TMPipeline<CustomOutput>([...this.pipeline, ...pipelineStages]);
  }

  // $match step
  match<const M extends MatchQuery<StartingDocs>>(
    $match: M
  ): TMPipeline<ResolveMatchOutput<M, StartingDocs>> {
    return new TMPipeline<ResolveMatchOutput<M, StartingDocs>>([
      ...this.pipeline,
      { $match },
    ]);
  }

  set<const S extends SetQuery<PreviousStageDocs>>(
    $set: S
  ): TMPipeline<StartingDocs, ResolveSetOutput<S, PreviousStageDocs>> {
    return new TMPipeline<StartingDocs, ResolveSetOutput<S, PreviousStageDocs>>(
      [...this.pipeline, { $set }]
    );
  }

  unset<const U extends UnsetQuery<StartingDocs>>(
    $unset: U
  ): TMPipeline<ResolveUnsetOutput<U, StartingDocs>> {
    return new TMPipeline<ResolveUnsetOutput<U, StartingDocs>>([
      ...this.pipeline,
      { $unset },
    ]);
  }

  // Lookup with function-only pipeline for automatic type inference
  lookup<
    C extends TMCollection<any>,
    LocalField extends FieldPath<StartingDocs>,
    LocalFieldType extends GetFieldType<StartingDocs, LocalField>,
    ForeignField extends
      | FieldPathsThatInferToForLookup<
          InferCollectionType<C>,
          LocalFieldType extends string ? string : LocalFieldType
        >
      | FieldPathsThatInferToForLookup<InferCollectionType<C>, LocalFieldType>,
    NewKey extends string,
    PipelineOutput extends Document = InferCollectionType<C>,
  >(
    $lookup:
      | {
          from: C;
          localField: LocalField;
          foreignField: ForeignField;
          as: NewKey;
          pipeline?: PLFrom<InferCollectionType<C>, PipelineOutput>;
        }
      | {
          from: C;
          as: NewKey;
          pipeline: PLFrom<InferCollectionType<C>, PipelineOutput>;
        }
  ): TMPipeline<
    StartingDocs,
    ResolveLookupOutput<StartingDocs, NewKey, PipelineOutput>
  > {
    const { from, pipeline, ...$lookupRest } = $lookup;

    // Call the pipeline function with a properly typed pipeline
    const resolvedPipeline =
      pipeline ?
        pipeline(
          new TMPipeline<InferCollectionType<C>, InferCollectionType<C>>()
        )
      : undefined;

    return new TMPipeline<
      StartingDocs,
      ResolveLookupOutput<StartingDocs, NewKey, PipelineOutput>
    >([
      ...this.pipeline,
      {
        $lookup: {
          from: from.getCollectionName(),
          ...$lookupRest,
          ...(resolvedPipeline && { pipeline: resolvedPipeline.getPipeline() }),
        },
      },
    ]);
  }

  group<const G extends GroupQuery<StartingDocs>>(
    $group: G
  ): TMPipeline<StartingDocs, ResolveGroupOutput<StartingDocs, G>> {
    return new TMPipeline<StartingDocs, ResolveGroupOutput<StartingDocs, G>>([
      ...this.pipeline,
      { $group },
    ]);
  }

  project<const P extends ProjectQuery<PreviousStageDocs>>(
    $project: P
  ): TMPipeline<StartingDocs, ResolveProjectOutput<P, PreviousStageDocs>> {
    return new TMPipeline<
      StartingDocs,
      ResolveProjectOutput<P, PreviousStageDocs>
    >([...this.pipeline, { $project }]);
  }

  replaceRoot<const R extends ReplaceRootQuery<PreviousStageDocs>>(
    $replaceRoot: R
  ): TMPipeline<StartingDocs, ResolveReplaceRootOutput<R, PreviousStageDocs>> {
    return new TMPipeline<
      StartingDocs,
      ResolveReplaceRootOutput<R, PreviousStageDocs>
    >([...this.pipeline, { $replaceRoot }]);
  }

  unionWith<
    C extends TMCollection<any>,
    PipelineOutput extends Document = InferCollectionType<C>,
  >(
    $unionWith:
      | {
          coll: C;
          pipeline?: PLFrom<InferCollectionType<C>, PipelineOutput>;
        }
      | {
          coll: C;
          pipeline: PLFrom<InferCollectionType<C>, PipelineOutput>;
        }
  ): TMPipeline<
    StartingDocs,
    ResolveUnionWithOutput<PreviousStageDocs, PipelineOutput>
  > {
    const { coll, pipeline } = $unionWith;

    // Call the pipeline function with a properly typed pipeline
    const resolvedPipeline =
      pipeline ?
        pipeline(
          new TMPipeline<InferCollectionType<C>, InferCollectionType<C>>()
        )
      : undefined;

    return new TMPipeline<
      StartingDocs,
      ResolveUnionWithOutput<PreviousStageDocs, PipelineOutput>
    >([
      ...this.pipeline,
      {
        $unionWith: {
          coll: coll.getCollectionName(),
          ...(resolvedPipeline && { pipeline: resolvedPipeline.getPipeline() }),
        },
      },
    ]);
  }

  out($out: string) {
    return new TMPipeline<StartingDocs, never>([...this.pipeline, { $out }]);
  }

  // out(): TMCollection<StartingDocs>
}

export type InferOutputType<Pipeline extends TMPipeline<any, any>> =
  Pipeline extends TMPipeline<any, infer Output> ? Output : never;
