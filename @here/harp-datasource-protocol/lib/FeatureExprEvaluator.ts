/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Env, Expr, MapEnv, Value } from "./Expr";
import { getPropertyValue, isInterpolatedProperty } from "./InterpolatedProperty";
import { InterpolatedProperty } from "./InterpolatedPropertyDefs";

/**
 * Environment needed to evaluate technique properties dependent on feature attributes.
 */
export interface FeatureEnv {
    /**
     * Feature properties.
     */
    env: MapEnv;

    /**
     * Storage level of tile containing this feature.
     */
    storageLevel: number;

    /**
     * Optional, cache of expression results.
     *
     * @see [[Expr.evaluate]]
     */
    cachedExprResults?: Map<Expr, Value>;
}

export function createFeatureEnv(
    env: Env,
    storageLevel: number,
    cachedExprResults?: Map<Expr, Value>
) {
    return { env, storageLevel, cachedExprResults };
}
/**
 * Evaluate feature attr _without_ default value.
 *
 * @returns actual value or `undefined`
 */
export function evaluateFeatureAttr<T = Value>(
    attrValue: T | Expr | InterpolatedProperty<T> | undefined,
    env: FeatureEnv
): T | undefined;

/**
 * Evaluate feature attr _with_ default value.
 *
 * @returns actual value or `defaultValue`
 */
export function evaluateFeatureAttr<T = Value>(
    attrValue: T | Expr | InterpolatedProperty<T> | undefined,
    env: FeatureEnv,
    defaultValue: T
): T;

export function evaluateFeatureAttr<T = Value>(
    attrValue: T | Expr | InterpolatedProperty<T> | undefined,
    env: FeatureEnv,
    defaultValue?: T
): T | undefined {
    let evaluated: Value | undefined;
    if (attrValue instanceof Expr) {
        evaluated = attrValue.evaluate(env.env, env.cachedExprResults);
    } else if (isInterpolatedProperty(attrValue)) {
        evaluated = getPropertyValue(attrValue, env.storageLevel);
    } else {
        evaluated = (attrValue as unknown) as Value;
    }
    if (evaluated === undefined) {
        return defaultValue;
    } else {
        return (evaluated as unknown) as T;
    }
}
