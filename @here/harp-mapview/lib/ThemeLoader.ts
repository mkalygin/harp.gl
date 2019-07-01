/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { isReference, isValueDefinition, Theme } from "@here/harp-datasource-protocol/lib/Theme";
import { composeUrlResolvers, defaultUrlResolver, resolveReferenceUrl } from "@here/harp-utils";
import { SKY_CUBEMAP_FACE_COUNT, SkyCubemapFaceId } from "./SkyCubemapTexture";

import "@here/harp-fetch";

export const DEFAULT_MAX_THEME_INTHERITANCE_DEPTH = 4;
/**
 * Loads and validates a theme from URL objects.
 */
export class ThemeLoader {
    /**
     * Loads a [[Theme]] from a remote resource, provided as a URL that points to a
     * JSON-encoded theme.
     *
     * Relative URLs are resolved to full URL using the document's base URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * @param theme [Theme] instance or theme URL to the theme.
     * @param expand A boolean to control if references should be expanded.
     */
    static async load(theme: string | Theme, expand: boolean = true): Promise<Theme> {
        if (typeof theme === "string") {
            const themeUrl = defaultUrlResolver(theme);

            const response = await fetch(themeUrl);
            if (!response.ok) {
                throw new Error(`ThemeLoader#load: cannot load theme: ${response.statusText}`);
            }
            theme = (await response.json()) as Theme;
            theme.url = themeUrl;
        }

        if (theme === null || theme === undefined) {
            throw new Error("ThemeLoader#load: loaded resource is not valid JSON");
        }
        theme = theme as Theme;
        // Remember the URL where the theme has been loaded from.

        const resolvedTheme = this.resolveUrls(theme);

        const withBase = await ThemeLoader.resolveBaseTheme(resolvedTheme);
        if (expand) {
            return this.expandReferences(withBase);
        }

        return withBase;
    }
    /**
     * Loads a [[Theme]] from a remote resource, provided as a URL that points to a
     * JSON-encoded theme.
     *
     * Relative URLs are resolved to full URL using the document's base URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * @param themeUrl The URL to the theme.
     * @param expand A boolean to control if references should be expanded.
     *
     * @deprecated Please use `ThemeLoader.load`
     */
    static async loadAsync(themeUrl: string, expand: boolean = true): Promise<Theme> {
        return ThemeLoader.load(themeUrl, expand);
    }

    /**
     * Resolves all [[Theme]]'s relatives URLs to full URL using the [[Theme]]'s URL
     * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
     *
     * This method mutates original `theme` instance.
     *
     * @param theme The [[Theme]] to resolve.
     */
    static resolveUrls(theme: Theme): Theme {
        // Ensure that all resources referenced in theme by relative URLs are in fact relative to
        // theme.
        if (theme.url === undefined) {
            return theme;
        }

        const childUrlResolver = composeUrlResolvers(
            (childUrl: string) => resolveReferenceUrl(theme.url, childUrl),
            defaultUrlResolver
        );

        if (theme.extends) {
            if (typeof theme.extends === "string") {
                theme.extends = childUrlResolver(theme.extends);
            } else {
                if (theme.extends.url === undefined) {
                    theme.extends.url = theme.url;
                    theme.extends = this.resolveUrls(theme.extends);
                }
            }
        }

        if (theme.sky && theme.sky.type === "cubemap") {
            for (let i = 0; i < SKY_CUBEMAP_FACE_COUNT; ++i) {
                const faceUrl: string | undefined = (theme.sky as any)[SkyCubemapFaceId[i]];
                if (faceUrl !== undefined) {
                    (theme.sky as any)[SkyCubemapFaceId[i]] = childUrlResolver(faceUrl);
                }
            }
        }
        if (theme.images) {
            for (const name of Object.keys(theme.images)) {
                const image = theme.images[name];
                image.url = childUrlResolver(image.url);

                if (image.atlas !== undefined) {
                    image.atlas = childUrlResolver(image.atlas);
                }
            }
        }
        if (theme.fontCatalogs) {
            for (const font of theme.fontCatalogs) {
                font.url = childUrlResolver(font.url);
            }
        }
        if (theme.poiTables) {
            for (const poiTable of theme.poiTables) {
                poiTable.url = childUrlResolver(poiTable.url);
            }
        }

        if (theme.styles) {
            for (const styleSetName in theme.styles) {
                if (!theme.styles.hasOwnProperty(styleSetName)) {
                    continue;
                }
                const styleSet = theme.styles[styleSetName];
                for (const style of styleSet) {
                    if (!style.attr) {
                        continue;
                    }
                    ["map", "normalMap", "displacementMap", "roughnessMap"].forEach(
                        texturePropertyName => {
                            const textureProperty = (style.attr! as any)[texturePropertyName];
                            if (textureProperty && typeof textureProperty === "string") {
                                (style.attr! as any)[texturePropertyName] = childUrlResolver(
                                    textureProperty
                                );
                            }
                        }
                    );
                }
            }
        }
        return theme;
    }

    /**
     * Expand all `$ref` in theme basing on `definitions`.
     *
     * This method mutates original `theme` instance.
     *
     * @param theme
     */
    static async expandReferences(theme: Theme): Promise<Theme> {
        const result = await this.resolveBaseTheme(theme);

        if (result.styles === undefined) {
            return result;
        }

        if (result.definitions === undefined) {
            return result;
        }

        const defs = result.definitions;

        function hasOwnProperty(obj: any, name: string) {
            return Object.prototype.hasOwnProperty.call(obj, name);
        }

        for (const styleSetName in result.styles) {
            if (!hasOwnProperty(result.styles, styleSetName)) {
                continue;
            }

            const styleSet = result.styles[styleSetName];

            styleSet.forEach((currentStyle, index) => {
                let style = currentStyle;

                if (isReference(style)) {
                    // expand and instantiate references to style definitions.

                    const def = defs[style.$ref];

                    if (isValueDefinition(def)) {
                        // a style definition is required but a value is found, skip it.
                        return;
                    }

                    // instantiate the style
                    const styleDef = JSON.parse(JSON.stringify(def));
                    delete (style as any).$ref;
                    style = styleSet[index] = { ...styleDef, ...style } as any;
                }

                if (style.attr === undefined) {
                    // nothing to do.
                    return;
                }

                const attr = style.attr as any;

                for (const prop in attr) {
                    if (!hasOwnProperty(attr, prop)) {
                        continue;
                    }

                    const value = attr[prop];

                    if (!isReference(value)) {
                        continue; // nothing to do
                    }

                    const def = defs[value.$ref];

                    if (def === undefined || !isValueDefinition(def)) {
                        delete attr[prop];
                        continue; // unresolved property, warn the user.
                    }

                    attr[prop] = def.value;
                }
            });
        }
        return result;
    }

    /**
     * Realize `$extends` clause by merging `theme` with it's base [Theme].
     *
     * @param theme [Theme] object
     * @param maxInheritanceDepth maximum number of inherited themes - security measure against
     * overflow, default [DEFAULT_MAX_THEME_INTHERITANCE_DEPTH].
     */
    static async resolveBaseTheme(
        theme: Theme,
        maxInheritanceDepth = DEFAULT_MAX_THEME_INTHERITANCE_DEPTH
    ): Promise<Theme> {
        if (theme.extends === undefined) {
            return theme;
        }

        if (maxInheritanceDepth <= 0) {
            throw new Error(`maxInheritanceDepth reached when attempting to load base theme`);
        }

        const baseTheme = theme.extends;
        delete theme.extends;

        const actualBaseTheme = await ThemeLoader.load(baseTheme, false);

        const definitions = ThemeLoader.mergePropertiesDeep(
            actualBaseTheme.definitions,
            theme.definitions
        );
        const styles = { ...actualBaseTheme.styles, ...theme.styles };
        return this.resolveBaseTheme(
            { ...actualBaseTheme, ...theme, definitions, styles },
            maxInheritanceDepth - 1
        );
    }

    /**
     * Merge objects deep.
     * @param a
     * @param b
     */
    static mergePropertiesDeep<T extends any>(a: T, b: T): T {
        if (b === null) {
            return null!;
        } else if (b === undefined) {
            return a;
        } else if (Array.isArray(b)) {
            return b;
        } else if (typeof b === "object") {
            if (typeof a !== "object") {
                return b;
            } else {
                const r = { ...a };
                for (const bKey in b) {
                    if (b.hasOwnProperty(bKey)) {
                        const aValue = r[bKey];
                        const bValue = b[bKey];
                        r[bKey] = ThemeLoader.mergePropertiesDeep(aValue, bValue);
                    }
                }
                return r;
            }
        } else {
            return b;
        }
    }
}
