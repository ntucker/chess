var __BUNDLE_START_TIME__=globalThis.nativePerformanceNow?nativePerformanceNow():Date.now(),__DEV__=false,process=globalThis.process||{},__METRO_GLOBAL_PREFIX__='';process.env=process.env||{};process.env.NODE_ENV=process.env.NODE_ENV||"production";
(function (global) {
  /* eslint-disable no-var */ /**
                              * Copyright © 2024 650 Industries.
                              * Copyright © Meta Platforms, Inc. and affiliates.
                              *
                              * This source code is licensed under the MIT license found in the
                              * LICENSE file in the root directory of this source tree.
                              *
                              * Universal require runtime based on:
                              * https://github.com/facebook/metro/blob/ebd40efa3bd3363930ffe21120714a4d9e0b7bac/packages/metro-runtime/src/polyfills/require.js#L1
                              */'use strict';

  if (!global[`${__METRO_GLOBAL_PREFIX__}__d`]) {
    global.__r = metroRequire;
    global[`${__METRO_GLOBAL_PREFIX__}__d`] = define;
    global.__c = clear;
    global.__registerSegment = registerSegment;
  }
  var modules = clear();
  // Don't use a Symbol here, it would pull in an extra polyfill with all sorts of
  // additional stuff (e.g. Array.from).
  const EMPTY = {};
  const CYCLE_DETECTED = {};
  const {
    hasOwnProperty
  } = {};
  function clear() {
    modules = new Map();
    // We return modules here so that we can assign an initial value to modules
    // when defining it. Otherwise, we would have to do "let modules = null",
    // which will force us to add "nullthrows" everywhere.
    return modules;
  }
  function define(factory, moduleId, dependencyMap) {
    if (modules.has(moduleId)) {
      // prevent repeated calls to `global.nativeRequire` to overwrite modules
      // that are already loaded
      return;
    }
    const mod = {
      dependencyMap,
      factory,
      hasError: false,
      importedAll: EMPTY,
      importedDefault: EMPTY,
      isInitialized: false,
      publicModule: {
        exports: {}
      }
    };
    modules.set(moduleId, mod);
  }
  function metroRequire(moduleId, moduleIdHint) {
    // if (__DEV__ && typeof moduleId === 'string') {
    //   const verboseName = moduleId;
    //   moduleId = getModuleIdForVerboseName(verboseName);
    //   console.warn(
    //     `Requiring module "${verboseName}" by name is only supported for ` +
    //       'debugging purposes and will BREAK IN PRODUCTION!'
    //   );
    // }
    // UPSTREAM: https://github.com/facebook/metro/commit/5f8548c2210ac824c1989b347aa1b52438449a8d#diff-d1563cf313be4f94a026f469dbd47f0822593ccdbf1eb43ef9f651b6f60fb9ec
    // Unresolved optional dependencies are nulls in dependency maps
    if (moduleId === null) {
      throw new Error('Cannot find module');
    }
    const module = modules.get(moduleId);
    return module && module.isInitialized ? module.publicModule.exports : guardedLoadModule(moduleId, module, moduleIdHint);
  }
  // We print require cycles unless they match a pattern in the
  // `requireCycleIgnorePatterns` configuration.

  function metroImportDefault(moduleId, moduleIdHint) {
    if (modules.has(moduleId) && modules.get(moduleId)?.importedDefault !== EMPTY) {
      return modules.get(moduleId).importedDefault;
    }
    const exports = metroRequire(moduleId, moduleIdHint);
    const importedDefault = exports && exports.__esModule ? exports.default : exports;
    return modules.get(moduleId).importedDefault = importedDefault;
  }
  metroRequire.importDefault = metroImportDefault;
  function metroImportAll(moduleId, moduleIdHint) {
    if (modules.has(moduleId) && modules.get(moduleId)?.importedAll !== EMPTY) {
      return modules.get(moduleId).importedAll;
    }
    const exports = metroRequire(moduleId, moduleIdHint);
    let importedAll;
    if (exports && exports.__esModule) {
      importedAll = exports;
    } else {
      importedAll = {};
      // Refrain from using Object.assign, it has to work in ES3 environments.
      if (exports) {
        for (const key in exports) {
          if (hasOwnProperty.call(exports, key)) {
            importedAll[key] = exports[key];
          }
        }
      }
      importedAll.default = exports;
    }
    return modules.get(moduleId).importedAll = importedAll;
  }
  // NOTE(EvanBacon): Tag for e2e testing.
  metroRequire[Symbol.for('expo.require')] = true;
  metroRequire.importAll = metroImportAll;
  // The `require.context()` syntax is never executed in the runtime because it is converted
  // to `require()` in `metro/src/ModuleGraph/worker/collectDependencies.js` after collecting
  // dependencies. If the feature flag is not enabled then the conversion never takes place and this error is thrown (development only).
  metroRequire.context = function fallbackRequireContext() {
    throw new Error('The experimental Metro feature `require.context` is not enabled in your project.');
  };
  // `require.resolveWeak()` is a compile-time primitive (see collectDependencies.js)
  metroRequire.resolveWeak = function fallbackRequireResolveWeak() {
    throw new Error('require.resolveWeak cannot be called dynamically.');
  };
  // Same as metroRequire but without the confusing error behavior. If the module import throws an error, it will be thrown normally.
  metroRequire.unguarded = function requireUnguarded(moduleId, moduleIdHint) {
    const module = modules.get(moduleId);
    return module && module.isInitialized ? module.publicModule.exports : loadModuleImplementation(moduleId, module, moduleIdHint);
  };
  let inGuard = false;
  function guardedLoadModule(moduleId, module, moduleIdHint) {
    if (!inGuard && global.ErrorUtils) {
      inGuard = true;
      let returnValue;
      try {
        returnValue = loadModuleImplementation(moduleId, module, moduleIdHint);
      } catch (e) {
        // TODO: (moti) T48204692 Type this use of ErrorUtils.
        global.ErrorUtils.reportFatalError(e);
      }
      inGuard = false;
      return returnValue;
    } else {
      return loadModuleImplementation(moduleId, module, moduleIdHint);
    }
  }
  const ID_MASK_SHIFT = 16;
  const LOCAL_ID_MASK = 65535;
  function unpackModuleId(moduleId) {
    if (typeof moduleId !== 'number') {
      throw new Error('Module ID must be a number in unpackModuleId.');
    }
    const segmentId = moduleId >>> ID_MASK_SHIFT;
    const localId = moduleId & LOCAL_ID_MASK;
    return {
      segmentId,
      localId
    };
  }
  metroRequire.unpackModuleId = unpackModuleId;
  function packModuleId(value) {
    return (value.segmentId << ID_MASK_SHIFT) + value.localId;
  }
  metroRequire.packModuleId = packModuleId;
  const moduleDefinersBySegmentID = [];
  const definingSegmentByModuleID = new Map();
  function registerSegment(segmentId, moduleDefiner, moduleIds) {
    moduleDefinersBySegmentID[segmentId] = moduleDefiner;
    if (moduleIds) {
      moduleIds.forEach(moduleId => {
        if (!modules.has(moduleId) && !definingSegmentByModuleID.has(moduleId)) {
          definingSegmentByModuleID.set(moduleId, segmentId);
        }
      });
    }
  }
  function loadModuleImplementation(moduleId, module, moduleIdHint) {
    if (!module && moduleDefinersBySegmentID.length > 0) {
      const segmentId = definingSegmentByModuleID.get(moduleId) ?? 0;
      const definer = moduleDefinersBySegmentID[segmentId];
      if (definer != null) {
        definer(moduleId);
        module = modules.get(moduleId);
        definingSegmentByModuleID.delete(moduleId);
      }
    }
    // NOTE(EvanBacon): `nativeRequire` is used for legacy RAM bundles and the rest of the implementation doesn't appear to be public.
    // We use modern bundle splitting (with bytecode support) instead.
    //   const nativeRequire = global.nativeRequire;
    //   if (!module && nativeRequire) {
    //     const { segmentId, localId } = unpackModuleId(moduleId);
    //     nativeRequire(localId, segmentId);
    //     module = modules.get(moduleId);
    //   }
    if (!module) {
      throw unknownModuleError(moduleId, moduleIdHint);
    }
    if (module.hasError) {
      throw module.error;
    }
    // We must optimistically mark module as initialized before running the
    // factory to keep any require cycles inside the factory from causing an
    // infinite require loop.
    module.isInitialized = true;
    const {
      factory,
      dependencyMap
    } = module;
    try {
      const moduleObject = module.publicModule;
      moduleObject.id = moduleId;
      // keep args in sync with defineModuleCode in
      // metro/src/Resolver/index.js
      // and metro/src/ModuleGraph/worker.js
      factory?.(global, metroRequire, metroImportDefault, metroImportAll, moduleObject, moduleObject.exports, dependencyMap);
      // avoid removing factory in DEV mode as it breaks HMR
      {
        module.factory = undefined;
        module.dependencyMap = undefined;
      }
      return moduleObject.exports;
    } catch (e) {
      module.hasError = true;
      module.error = e;
      module.isInitialized = false;
      module.publicModule.exports = undefined;
      throw e;
    } finally {}
  }
  function unknownModuleError(id, moduleIdHint) {
    let message = 'Requiring unknown module "' + (id ?? moduleIdHint ?? `[unknown optional import]`) + '".';
    return Error(message);
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
(function (global) {
  global.$$require_external = typeof require !== "undefined" ? m => require(m) : () => null;
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
(function (global) {})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
(function (global) {
  let _inGuard = 0;
  let _globalHandler = global.RN$useAlwaysAvailableJSErrorHandling === true ? global.RN$handleException : (e, isFatal) => {
    throw e;
  };
  const ErrorUtils = {
    setGlobalHandler(fun) {
      _globalHandler = fun;
    },
    getGlobalHandler() {
      return _globalHandler;
    },
    reportError(error) {
      _globalHandler && _globalHandler(error, false);
    },
    reportFatalError(error) {
      _globalHandler && _globalHandler(error, true);
    },
    applyWithGuard(fun, context, args, unused_onError, unused_name) {
      try {
        _inGuard++;
        return fun.apply(context, args);
      } catch (e) {
        ErrorUtils.reportError(e);
      } finally {
        _inGuard--;
      }
      return null;
    },
    applyWithGuardIfNeeded(fun, context, args) {
      if (ErrorUtils.inGuard()) {
        return fun.apply(context, args);
      } else {
        ErrorUtils.applyWithGuard(fun, context, args);
      }
      return null;
    },
    inGuard() {
      return !!_inGuard;
    },
    guard(fun, name, context) {
      if (typeof fun !== 'function') {
        console.warn('A function must be passed to ErrorUtils.guard, got ', fun);
        return null;
      }
      const guardName = name ?? fun.name ?? '<generated guard>';
      function guarded(...args) {
        return ErrorUtils.applyWithGuard(fun, context ?? this, args, null, guardName);
      }
      return guarded;
    }
  };
  global.ErrorUtils = ErrorUtils;
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof window !== 'undefined' ? window : this);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "INPUT_PLANES", {
    enumerable: true,
    get: function () {
      return INPUT_PLANES;
    }
  });
  Object.defineProperty(exports, "parseNetwork", {
    enumerable: true,
    get: function () {
      return parseNetwork;
    }
  });
  Object.defineProperty(exports, "forward", {
    enumerable: true,
    get: function () {
      return forward;
    }
  });
  /**
   * Maia's neural network: the residual tower, convolutional policy head and
   * win/draw/loss value head of a Leela Chess Zero network, run in plain
   * TypeScript so it works the same on the web, on phones and in tests. Weights
   * come from the files that scripts/convert-maia.mjs writes, with batch norm
   * already folded in.
   *
   * Activations are kept per channel on a 10x10 grid: the 8x8 board with a
   * border of zeros, so a 3x3 convolution needs no edge checks.
   *
   * The 'worklet' directive above lets the Android app run these functions on
   * a background thread (see engine.ts). It keeps this file free of
   * imports: a worklet can only call other worklets. Worklets are created in
   * order, so each function must come after the ones it calls.
   */
  const INPUT_PLANES = 112;
  const POLICY_PLANES = 80;
  const PADDED = 100;

  /** A convolution's or dense layer's weights and biases. */
  const _worklet_3692913698332_init_data = {
    code: "(function pad_networkTs1(planes,count){const[PADDED]=this.__closure;const out=new Float32Array(count*PADDED);for(let p=0;p<count;p++){for(let y=0;y<8;y++){for(let x=0;x<8;x++){out[p*PADDED+(y+1)*10+x+1]=planes[p*64+y*8+x];}}}return out;})"
  };
  /** Planes of 64 squares to padded planes of 100. */
  const pad = function pad_networkTs1Factory([_worklet_3692913698332_init_data, PADDED]) {
    const pad = function (planes, count) {
      "use no memo";

      const out = new Float32Array(count * PADDED);
      for (let p = 0; p < count; p++) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            out[p * PADDED + (y + 1) * 10 + x + 1] = planes[p * 64 + y * 8 + x];
          }
        }
      }
      return out;
    };
    pad.__closure = [PADDED];
    pad.__workletHash = 3692913698332;
    pad.__initData = _worklet_3692913698332_init_data;
    return pad;
  }([_worklet_3692913698332_init_data, PADDED]);
  const _worklet_9078689523190_init_data = {
    code: "(function unpad_networkTs2(planes,count){const[PADDED]=this.__closure;const out=new Float32Array(count*64);for(let p=0;p<count;p++){for(let y=0;y<8;y++){for(let x=0;x<8;x++){out[p*64+y*8+x]=planes[p*PADDED+(y+1)*10+x+1];}}}return out;})"
  };
  const unpad = function unpad_networkTs2Factory([_worklet_9078689523190_init_data, PADDED]) {
    const unpad = function (planes, count) {
      "use no memo";

      const out = new Float32Array(count * 64);
      for (let p = 0; p < count; p++) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            out[p * 64 + y * 8 + x] = planes[p * PADDED + (y + 1) * 10 + x + 1];
          }
        }
      }
      return out;
    };
    unpad.__closure = [PADDED];
    unpad.__workletHash = 9078689523190;
    unpad.__initData = _worklet_9078689523190_init_data;
    return unpad;
  }([_worklet_9078689523190_init_data, PADDED]);
  /**
   * A 3x3 convolution with zero padding, from padded planes to padded planes.
   * It works out one output row at a time with its 8 sums, 3 weights and 10
   * inputs in local variables, which runs about 5 times faster than looping
   * over each square, with or without a JIT.
   */
  const _worklet_5177382601524_init_data = {
    code: "(function convolve_networkTs3(input,inputs,conv,relu){const[PADDED]=this.__closure;const outputs=conv.biases.length;const out=new Float32Array(outputs*PADDED);const w=conv.weights;for(let o=0;o<outputs;o++){const bias=conv.biases[o];for(let y=0;y<8;y++){let a0=bias,a1=bias,a2=bias,a3=bias,a4=bias,a5=bias,a6=bias,a7=bias;for(let i=0;i<inputs;i++){let k=(o*inputs+i)*9;for(let r=i*PADDED+y*10,end=r+30;r<end;r+=10,k+=3){const w0=w[k],w1=w[k+1],w2=w[k+2];const p0=input[r],p1=input[r+1],p2=input[r+2],p3=input[r+3];const p4=input[r+4],p5=input[r+5],p6=input[r+6],p7=input[r+7];const p8=input[r+8],p9=input[r+9];a0+=w0*p0+w1*p1+w2*p2;a1+=w0*p1+w1*p2+w2*p3;a2+=w0*p2+w1*p3+w2*p4;a3+=w0*p3+w1*p4+w2*p5;a4+=w0*p4+w1*p5+w2*p6;a5+=w0*p5+w1*p6+w2*p7;a6+=w0*p6+w1*p7+w2*p8;a7+=w0*p7+w1*p8+w2*p9;}}const at=o*PADDED+(y+1)*10+1;out[at]=relu&&a0<0?0:a0;out[at+1]=relu&&a1<0?0:a1;out[at+2]=relu&&a2<0?0:a2;out[at+3]=relu&&a3<0?0:a3;out[at+4]=relu&&a4<0?0:a4;out[at+5]=relu&&a5<0?0:a5;out[at+6]=relu&&a6<0?0:a6;out[at+7]=relu&&a7<0?0:a7;}}return out;})"
  };
  const convolve = function convolve_networkTs3Factory([_worklet_5177382601524_init_data, PADDED]) {
    const convolve = function (input, inputs, conv, relu) {
      "use no memo";

      const outputs = conv.biases.length;
      const out = new Float32Array(outputs * PADDED);
      const w = conv.weights;
      for (let o = 0; o < outputs; o++) {
        const bias = conv.biases[o];
        for (let y = 0; y < 8; y++) {
          let a0 = bias,
            a1 = bias,
            a2 = bias,
            a3 = bias,
            a4 = bias,
            a5 = bias,
            a6 = bias,
            a7 = bias;
          for (let i = 0; i < inputs; i++) {
            let k = (o * inputs + i) * 9;
            // The kernel's three rows read the padded rows y, y + 1 and y + 2.
            for (let r = i * PADDED + y * 10, end = r + 30; r < end; r += 10, k += 3) {
              const w0 = w[k],
                w1 = w[k + 1],
                w2 = w[k + 2];
              const p0 = input[r],
                p1 = input[r + 1],
                p2 = input[r + 2],
                p3 = input[r + 3];
              const p4 = input[r + 4],
                p5 = input[r + 5],
                p6 = input[r + 6],
                p7 = input[r + 7];
              const p8 = input[r + 8],
                p9 = input[r + 9];
              a0 += w0 * p0 + w1 * p1 + w2 * p2;
              a1 += w0 * p1 + w1 * p2 + w2 * p3;
              a2 += w0 * p2 + w1 * p3 + w2 * p4;
              a3 += w0 * p3 + w1 * p4 + w2 * p5;
              a4 += w0 * p4 + w1 * p5 + w2 * p6;
              a5 += w0 * p5 + w1 * p6 + w2 * p7;
              a6 += w0 * p6 + w1 * p7 + w2 * p8;
              a7 += w0 * p7 + w1 * p8 + w2 * p9;
            }
          }
          const at = o * PADDED + (y + 1) * 10 + 1;
          out[at] = relu && a0 < 0 ? 0 : a0;
          out[at + 1] = relu && a1 < 0 ? 0 : a1;
          out[at + 2] = relu && a2 < 0 ? 0 : a2;
          out[at + 3] = relu && a3 < 0 ? 0 : a3;
          out[at + 4] = relu && a4 < 0 ? 0 : a4;
          out[at + 5] = relu && a5 < 0 ? 0 : a5;
          out[at + 6] = relu && a6 < 0 ? 0 : a6;
          out[at + 7] = relu && a7 < 0 ? 0 : a7;
        }
      }
      return out;
    };
    convolve.__closure = [PADDED];
    convolve.__workletHash = 5177382601524;
    convolve.__initData = _worklet_5177382601524_init_data;
    return convolve;
  }([_worklet_5177382601524_init_data, PADDED]);
  const _worklet_13792596324513_init_data = {
    code: "(function dense_networkTs4(input,weights,biases,relu){const out=new Float32Array(biases.length);for(let o=0;o<out.length;o++){let v=biases[o];for(let i=0;i<input.length;i++)v+=weights[o*input.length+i]*input[i];out[o]=relu&&v<0?0:v;}return out;})"
  };
  const dense = function dense_networkTs4Factory([_worklet_13792596324513_init_data]) {
    const dense = function (input, weights, biases, relu) {
      "use no memo";

      const out = new Float32Array(biases.length);
      for (let o = 0; o < out.length; o++) {
        let v = biases[o];
        for (let i = 0; i < input.length; i++) v += weights[o * input.length + i] * input[i];
        out[o] = relu && v < 0 ? 0 : v;
      }
      return out;
    };
    dense.__workletHash = 13792596324513;
    dense.__initData = _worklet_13792596324513_init_data;
    return dense;
  }([_worklet_13792596324513_init_data]);
  /**
   * The end of a residual block: scales and shifts each channel of `z` by
   * amounts computed from the channel averages, adds the block's input back,
   * and applies ReLU.
   */
  const _worklet_6836529842021_init_data = {
    code: "(function squeezeExcite_networkTs5(z,residual,channels,se){const[PADDED,dense]=this.__closure;const pooled=new Float32Array(channels);for(let c=0;c<channels;c++){let sum=0;for(let y=1;y<=8;y++){for(let x=1;x<=8;x++)sum+=z[c*PADDED+y*10+x];}pooled[c]=sum/64;}const hidden=dense(pooled,se.w1,se.b1,true);const gates=dense(hidden,se.w2,se.b2,false);const out=new Float32Array(channels*PADDED);for(let c=0;c<channels;c++){const gamma=1/(1+Math.exp(-gates[c]));const beta=gates[channels+c];for(let y=1;y<=8;y++){for(let x=1;x<=8;x++){const i=c*PADDED+y*10+x;const v=gamma*z[i]+beta+residual[i];out[i]=v>0?v:0;}}}return out;})"
  };
  const squeezeExcite = function squeezeExcite_networkTs5Factory([_worklet_6836529842021_init_data, PADDED, dense]) {
    const squeezeExcite = function (z, residual, channels, se) {
      "use no memo";

      const pooled = new Float32Array(channels);
      for (let c = 0; c < channels; c++) {
        let sum = 0;
        for (let y = 1; y <= 8; y++) {
          for (let x = 1; x <= 8; x++) sum += z[c * PADDED + y * 10 + x];
        }
        pooled[c] = sum / 64;
      }
      const hidden = dense(pooled, se.w1, se.b1, true);
      const gates = dense(hidden, se.w2, se.b2, false);
      const out = new Float32Array(channels * PADDED);
      for (let c = 0; c < channels; c++) {
        const gamma = 1 / (1 + Math.exp(-gates[c]));
        const beta = gates[channels + c];
        for (let y = 1; y <= 8; y++) {
          for (let x = 1; x <= 8; x++) {
            const i = c * PADDED + y * 10 + x;
            const v = gamma * z[i] + beta + residual[i];
            out[i] = v > 0 ? v : 0;
          }
        }
      }
      return out;
    };
    squeezeExcite.__closure = [PADDED, dense];
    squeezeExcite.__workletHash = 6836529842021;
    squeezeExcite.__initData = _worklet_6836529842021_init_data;
    return squeezeExcite;
  }([_worklet_6836529842021_init_data, PADDED, dense]);
  /**
   * A 1x1 convolution with ReLU, from padded planes to unpadded planes: each
   * output square is a weighted sum of the input channels on that square.
   */
  const _worklet_10719454292221_init_data = {
    code: "(function pointwise_networkTs6(input,inputs,conv){const[PADDED]=this.__closure;const outputs=conv.biases.length;const out=new Float32Array(outputs*64);for(let o=0;o<outputs;o++){for(let y=0;y<8;y++){for(let x=0;x<8;x++){let v=conv.biases[o];for(let i=0;i<inputs;i++){v+=conv.weights[o*inputs+i]*input[i*PADDED+(y+1)*10+x+1];}out[o*64+y*8+x]=v>0?v:0;}}}return out;})"
  };
  const pointwise = function pointwise_networkTs6Factory([_worklet_10719454292221_init_data, PADDED]) {
    const pointwise = function (input, inputs, conv) {
      "use no memo";

      const outputs = conv.biases.length;
      const out = new Float32Array(outputs * 64);
      for (let o = 0; o < outputs; o++) {
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            let v = conv.biases[o];
            for (let i = 0; i < inputs; i++) {
              v += conv.weights[o * inputs + i] * input[i * PADDED + (y + 1) * 10 + x + 1];
            }
            out[o * 64 + y * 8 + x] = v > 0 ? v : 0;
          }
        }
      }
      return out;
    };
    pointwise.__closure = [PADDED];
    pointwise.__workletHash = 10719454292221;
    pointwise.__initData = _worklet_10719454292221_init_data;
    return pointwise;
  }([_worklet_10719454292221_init_data, PADDED]);
  const _worklet_10518947669899_init_data = {
    code: "(function softmax_networkTs7(logits){const max=Math.max(...logits);const out=logits.map(function(v){return Math.exp(v-max);});const sum=out.reduce(function(a,b){return a+b;},0);return out.map(function(v){return v/sum;});})"
  };
  const softmax = function softmax_networkTs7Factory([_worklet_10518947669899_init_data]) {
    const softmax = function (logits) {
      "use no memo";

      const max = Math.max(...logits);
      const out = logits.map(v => Math.exp(v - max));
      const sum = out.reduce((a, b) => a + b, 0);
      return out.map(v => v / sum);
    };
    softmax.__workletHash = 10518947669899;
    softmax.__initData = _worklet_10518947669899_init_data;
    return softmax;
  }([_worklet_10518947669899_init_data]);
  /** The value head: a 1x1 convolution, then two dense layers. */
  const _worklet_7731784292121_init_data = {
    code: "(function winDrawLoss_networkTs8(x,channels,head){const[dense,pointwise,softmax]=this.__closure;const{conv:conv,hidden:hidden,out:out}=head;const h=dense(pointwise(x,channels,conv),hidden.weights,hidden.biases,true);return softmax(dense(h,out.weights,out.biases,false));})"
  };
  /** How likely the side to move is to win, draw and lose, from the tower's output `x`. */
  const winDrawLoss = function winDrawLoss_networkTs8Factory([_worklet_7731784292121_init_data, dense, pointwise, softmax]) {
    const winDrawLoss = function (x, channels, head) {
      "use no memo";

      const {
        conv,
        hidden,
        out
      } = head;
      const h = dense(pointwise(x, channels, conv), hidden.weights, hidden.biases, true);
      return softmax(dense(h, out.weights, out.biases, false));
    };
    winDrawLoss.__closure = [dense, pointwise, softmax];
    winDrawLoss.__workletHash = 7731784292121;
    winDrawLoss.__initData = _worklet_7731784292121_init_data;
    return winDrawLoss;
  }([_worklet_7731784292121_init_data, dense, pointwise, softmax]);
  /** A network's weights, as `parseNetwork` reads them. */
  const _worklet_3223410408868_init_data = {
    code: "(function parseNetwork_networkTs9(bytes){const view=bytes instanceof Uint8Array?new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength):new DataView(bytes);const magic=String.fromCharCode(view.getUint8(0),view.getUint8(1),view.getUint8(2),view.getUint8(3));const version=view.getUint16(4,true);if(magic!=='MAIA'||version!==1&&version!==2){throw new Error('Not a Maia network file');}const blockCount=view.getUint16(6,true);let at=12;const tensor=function(){const min=view.getFloat32(at,true);const max=view.getFloat32(at+4,true);const values=new Float32Array(view.getUint32(at+8,true));at+=12;const step=(max-min)/0xffff;for(let i=0;i<values.length;i++,at+=2){values[i]=min+view.getUint16(at,true)*step;}return values;};const layer=function(){return{weights:tensor(),biases:tensor()};};const input=layer();const blocks=[];for(let i=0;i<blockCount;i++){const conv1=layer();const conv2=layer();blocks.push({conv1:conv1,conv2:conv2,se:{w1:tensor(),b1:tensor(),w2:tensor(),b2:tensor()}});}const policy1=layer();const policy=layer();const value=version===2?{conv:layer(),hidden:layer(),out:layer()}:undefined;return{input:input,blocks:blocks,policy1:policy1,policy:policy,value:value};})"
  };
  /** Reads a network from a .bin file's bytes. */
  const parseNetwork = function parseNetwork_networkTs9Factory([_worklet_3223410408868_init_data]) {
    const parseNetwork = function (bytes) {
      "use no memo";

      const view = bytes instanceof Uint8Array ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) : new DataView(bytes);
      const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      // Version 2 adds the value head.
      const version = view.getUint16(4, true);
      if (magic !== 'MAIA' || version !== 1 && version !== 2) {
        throw new Error('Not a Maia network file');
      }
      const blockCount = view.getUint16(6, true);
      let at = 12;
      const tensor = () => {
        const min = view.getFloat32(at, true);
        const max = view.getFloat32(at + 4, true);
        const values = new Float32Array(view.getUint32(at + 8, true));
        at += 12;
        const step = (max - min) / 0xffff;
        for (let i = 0; i < values.length; i++, at += 2) {
          values[i] = min + view.getUint16(at, true) * step;
        }
        return values;
      };
      const layer = () => ({
        weights: tensor(),
        biases: tensor()
      });
      const input = layer();
      const blocks = [];
      for (let i = 0; i < blockCount; i++) {
        const conv1 = layer();
        const conv2 = layer();
        blocks.push({
          conv1,
          conv2,
          se: {
            w1: tensor(),
            b1: tensor(),
            w2: tensor(),
            b2: tensor()
          }
        });
      }
      const policy1 = layer();
      const policy = layer();
      const value = version === 2 ? {
        conv: layer(),
        hidden: layer(),
        out: layer()
      } : undefined;
      return {
        input,
        blocks,
        policy1,
        policy,
        value
      };
    };
    parseNetwork.__workletHash = 3223410408868;
    parseNetwork.__initData = _worklet_3223410408868_init_data;
    return parseNetwork;
  }([_worklet_3223410408868_init_data]);
  /** What the network makes of a position (see `forward`). */
  const _worklet_11790714935731_init_data = {
    code: "(function forward_networkTs10(network,planes){const[convolve,pad,INPUT_PLANES,squeezeExcite,unpad,POLICY_PLANES,winDrawLoss]=this.__closure;const c=network.input.biases.length;let x=convolve(pad(planes,INPUT_PLANES),INPUT_PLANES,network.input,true);for(const block of network.blocks){const y=convolve(x,c,block.conv1,true);const z=convolve(y,c,block.conv2,false);x=squeezeExcite(z,x,c,block.se);}const p=convolve(x,c,network.policy1,true);const policy=unpad(convolve(p,c,network.policy,false),POLICY_PLANES);const wdl=network.value&&winDrawLoss(x,c,network.value);return{policy:policy,wdl:wdl};})"
  };
  /** Runs the network on input planes from `prepareInput`. */
  const forward = function forward_networkTs10Factory([_worklet_11790714935731_init_data, convolve, pad, INPUT_PLANES, squeezeExcite, unpad, POLICY_PLANES, winDrawLoss]) {
    const forward = function (network, planes) {
      "use no memo";

      const c = network.input.biases.length;
      let x = convolve(pad(planes, INPUT_PLANES), INPUT_PLANES, network.input, true);
      for (const block of network.blocks) {
        const y = convolve(x, c, block.conv1, true);
        const z = convolve(y, c, block.conv2, false);
        x = squeezeExcite(z, x, c, block.se);
      }
      const p = convolve(x, c, network.policy1, true);
      const policy = unpad(convolve(p, c, network.policy, false), POLICY_PLANES);
      const wdl = network.value && winDrawLoss(x, c, network.value);
      return {
        policy,
        wdl
      };
    };
    forward.__closure = [convolve, pad, INPUT_PLANES, squeezeExcite, unpad, POLICY_PLANES, winDrawLoss];
    forward.__workletHash = 11790714935731;
    forward.__initData = _worklet_11790714935731_init_data;
    return forward;
  }([_worklet_11790714935731_init_data, convolve, pad, INPUT_PLANES, squeezeExcite, unpad, POLICY_PLANES, winDrawLoss]);
},1471,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  var _filesFetchOk = require(_dependencyMap[0]);
  var _loadOnce = require(_dependencyMap[1]);
  var _network = require(_dependencyMap[2]);
  /// <reference lib="webworker" />

  /** Asks for the network at `url`'s output for `planes`. */

  const loadNetwork = (0, _loadOnce.loadOnce)(async url => {
    const response = await (0, _filesFetchOk.fetchOk)(url);
    return (0, _network.parseNetwork)(await response.arrayBuffer());
  });
  self.onmessage = async ({
    data
  }) => {
    const {
      id,
      url,
      planes
    } = data;
    try {
      const output = (0, _network.forward)(await loadNetwork(url), planes);
      const buffers = [output.policy.buffer, output.wdl?.buffer].filter(b => b !== undefined);
      self.postMessage({
        id,
        output
      }, buffers);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({
        id,
        error: message
      });
    }
  };
},1485,[1486,1487,1471]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  Object.defineProperty(exports, "HttpError", {
    enumerable: true,
    get: function () {
      return HttpError;
    }
  });
  exports.fetchOk = fetchOk;
  /** A server answered `url` with an error `status`. */
  class HttpError extends Error {
    constructor(url, status) {
      super(`${url}: HTTP ${status}`);
      this.url = url;
      this.status = status;
      this.name = 'HttpError';
    }
  }

  /**
   * Fetches `url`, rejecting with an HttpError when the server answers with an
   * error status, as well as when the request fails. Uses only the DOM, so
   * workers and web views can use it too.
   */
  async function fetchOk(url, init) {
    const response = await fetch(url, init);
    if (!response.ok) throw new HttpError(url, response.status);
    return response;
  }
},1486,[]);
__d(function (global, require, _$$_IMPORT_DEFAULT, _$$_IMPORT_ALL, module, exports, _dependencyMap) {
  "use strict";

  Object.defineProperty(exports, '__esModule', {
    value: true
  });
  exports.loadOnce = loadOnce;
  /**
   * Wraps `load` so each key loads once and later calls share the result. A
   * failed load is forgotten, so asking again tries again.
   */
  function loadOnce(load) {
    const loaded = new Map();
    return key => {
      let value = loaded.get(key);
      if (!value) {
        value = load(key);
        value.catch(() => loaded.delete(key));
        loaded.set(key, value);
      }
      return value;
    };
  }
},1487,[]);
__r(1485);