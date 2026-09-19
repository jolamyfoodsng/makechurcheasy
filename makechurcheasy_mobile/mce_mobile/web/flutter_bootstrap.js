{{flutter_js}}
{{flutter_build_config}}

// Keep the PWA cache, but never let service-worker installation block the
// first usable frame for several seconds on a fresh browser session.
_flutter.loader.load({
  serviceWorkerSettings: {
    serviceWorkerVersion: {{flutter_service_worker_version}},
    timeoutMillis: 800,
  },
});
