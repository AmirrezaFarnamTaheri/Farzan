// Side-effect: migrate legacy UI keys before any other app module reads localStorage.
import './core/storageMigrate.js';

import { initBeforeUnloadGuard } from './core/beforeUnloadGuard.js';
import { initEndpointApprovalGuard } from './core/endpointApprovalGuard.js';
import '../data.js';
import '../db.js';
import '../ui.js';
import '../bridge.js';
import { installStorageSafety } from './core/storageSafety.js';
import { installAuxiliaryDbLifecycle } from './core/auxiliaryDbLifecycle.js';
import { installDataHardening } from './core/dataHardening.js';
import { installStoreHardening } from './core/storeHardening.js';
import { installAIAuthority } from './core/aiAuthority.js';
import { enforceProductReadiness } from './core/productReadiness.js';
import { initCommandPalette } from './features/commandPalette.js';

import * as easing from './lib/easing.js';
import { HElement, h } from './lib/hElement.js';
import { RAFLoop } from './lib/rafLoop.js';
import { RequestQueue } from './lib/requestQueue.js';
import { stagger } from './lib/stagger.js';
import { Timeline } from './lib/timeline.js';
import { normalizeTimeIntervals, updateTimeIntervals } from './lib/timeRange.js';
import { VirtualList } from './lib/virtualScroll.js';
import { runInWorker, terminateAll, getWorkerStatus } from './lib/workerPool.js';
import { buildUserThemeVars } from './core/themeBuilder.js';
import * as locale from './core/locale.js';
import enUS from './locales/en-US.js';
import faIR from './locales/fa-IR.js';
import { TranslatorRegistry, BaseTranslator, GoogleTranslator, OpenAITranslator, CustomAPITranslator, LANGUAGES, getLanguageName } from './features/translator.js';
import * as translationCache from './features/translationCache.js';
import { getAllTemplates, getTemplate, saveAsTemplate, updateTemplate, deleteTemplate, getTemplatePickerItems } from './features/noteTemplates.js';
import { initAIClient } from './features/aiClient.js';
import { initErrorBoundary } from './features/errorBoundary.js';
import { initOfflineBanner } from './features/offlineBanner.js';
import './features/mediaStorage.js';
import { CanvasZoom } from './features/canvasZoom.js';
import { CourseGraph } from './features/courseGraph.js';
import { KnowledgeGraph } from './features/knowledgeGraph.js';

installAuxiliaryDbLifecycle(window);
installStorageSafety(window);
installDataHardening(window);
installStoreHardening(window);
installAIAuthority(window);
initEndpointApprovalGuard(document);

const pd = window.OpenCourseDeck = window.OpenCourseDeck || {};

pd.easing = easing;
pd.HElement = HElement;
pd.h = h;
pd.AuxiliaryDbLifecycle = window.OpenCourseDeck.AuxiliaryDbLifecycle;
