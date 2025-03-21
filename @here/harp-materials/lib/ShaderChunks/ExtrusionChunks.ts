/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
    extrusion_pars_vertex: `
// Extrusion axis (xyz: vector, w: factor).
attribute vec4 extrusionAxis;
uniform float extrusionRatio;
varying vec4 vExtrusionAxis;
`,
    extrusion_vertex: `
transformed = transformed - extrusionAxis.xyz + extrusionAxis.xyz * extrusionRatio;
vExtrusionAxis = vec4(normalMatrix * extrusionAxis.xyz, extrusionAxis.w);
`,
    // Modified version of THREE <normal_fragment_begin> shader chunk which, for flat shaded
    // geometries, computes the normal either with the extrusion axis or fragment derivatives based
    // on the extrusion factor (1.0 = ceiling, 0.0 = footprint).
    extrusion_normal_fragment_begin: `
#ifdef FLAT_SHADED
    vec3 normal = vec3(0.0);
    if (vExtrusionAxis.w > 0.999999) {
        normal = normalize(vExtrusionAxis.xyz);
    }
    else  {
        // Workaround for Adreno/Nexus5 not able able to do dFdx( vViewPosition ) ...
        vec3 fdx = vec3(dFdx(vViewPosition.x), dFdx(vViewPosition.y), dFdx(vViewPosition.z));
        vec3 fdy = vec3(dFdy(vViewPosition.x), dFdy(vViewPosition.y), dFdy(vViewPosition.z));
        normal = normalize( cross( fdx, fdy ) );
    }
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal = normal * (float(gl_FrontFacing) * 2.0 - 1.0);
	#endif
	#ifdef USE_TANGENT
		vec3 tangent = normalize( vTangent );
		vec3 bitangent = normalize( vBitangent );
		#ifdef DOUBLE_SIDED
			tangent = tangent * (float(gl_FrontFacing) * 2.0 - 1.0);
			bitangent = bitangent * (float(gl_FrontFacing) * 2.0 - 1.0);
		#endif
	#endif
#endif
// non perturbed normal for clearcoat among others
vec3 geometryNormal = normal;
`,
    extrusion_pars_fragment: `
uniform float extrusionRatio;
varying vec4 vExtrusionAxis;
`,
    extrusion_fragment: `
gl_FragColor.a *= smoothstep( 0.0, 0.25, extrusionRatio );
`
};
