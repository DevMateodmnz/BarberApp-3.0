export type TranslationNode = string | TranslationTree;

export interface TranslationTree {
  [key: string]: TranslationNode;
}

export type DeepTranslationShape<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends readonly string[]
      ? readonly string[]
      : DeepTranslationShape<T[K]>;
};
