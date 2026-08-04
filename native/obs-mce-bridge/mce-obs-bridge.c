/*
 * MakeChurchEasy OBS bridge
 *
 * This module exposes a hidden OBS input source that can be created through
 * obs-websocket. Creating the source asks OBS to create a private
 * move_transition source and make it the active frontend transition. The
 * temporary bridge input itself renders nothing and is removed by the app
 * immediately after the request completes.
 */

#include <obs-frontend-api.h>
#include <obs-module.h>
#include <obs-source.h>

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#if defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#include <mach-o/dyld.h>
#include <dlfcn.h>
#else
#include <dlfcn.h>
#endif

OBS_DECLARE_MODULE()

#define MCE_BRIDGE_SOURCE_ID "mce_move_bridge"
#define MCE_MOVE_TRANSITION_ID "move_transition"
#define MCE_MOVE_TRANSITION_NAME "MCE Move Transition"
#define MCE_DEFAULT_DURATION_MS 300

MODULE_EXPORT const char *obs_module_name(void)
{
	return "mce-obs-bridge";
}

MODULE_EXPORT const char *obs_module_description(void)
{
	return "MakeChurchEasy bridge for automatic OBS Move Transition setup";
}

MODULE_EXPORT const char *obs_module_author(void)
{
	return "MakeChurchEasy";
}

typedef void (*mce_register_source_fn)(const struct obs_source_info *info, size_t size);
typedef obs_data_t *(*mce_data_create_fn)(void);
typedef void (*mce_data_release_fn)(obs_data_t *data);
typedef void (*mce_data_set_string_fn)(obs_data_t *data, const char *name, const char *value);
typedef void (*mce_data_set_int_fn)(obs_data_t *data, const char *name, long long value);
typedef const char *(*mce_data_get_string_fn)(obs_data_t *data, const char *name);
typedef long long (*mce_data_get_int_fn)(obs_data_t *data, const char *name);
typedef obs_source_t *(*mce_source_create_private_fn)(const char *id, const char *name,
												  obs_data_t *settings);
typedef void (*mce_source_release_fn)(obs_source_t *source);
typedef void (*mce_frontend_set_transition_fn)(obs_source_t *transition);
typedef void (*mce_frontend_set_duration_fn)(int duration);

struct mce_api {
	mce_register_source_fn register_source;
	mce_data_create_fn data_create;
	mce_data_release_fn data_release;
	mce_data_set_string_fn data_set_string;
	mce_data_set_int_fn data_set_int;
	mce_data_get_string_fn data_get_string;
	mce_data_get_int_fn data_get_int;
	mce_source_create_private_fn source_create_private;
	mce_source_release_fn source_release;
	mce_frontend_set_transition_fn frontend_set_transition;
	mce_frontend_set_duration_fn frontend_set_duration;
	bool resolved;
};

static struct mce_api mce;

static void *mce_lookup_symbol(const char *name)
{
#if defined(_WIN32)
	HMODULE modules[4] = {
		GetModuleHandleW(NULL),
		GetModuleHandleW(L"obs.dll"),
		GetModuleHandleW(L"libobs.dll"),
		GetModuleHandleW(L"obs-frontend-api.dll"),
	};
	for (size_t i = 0; i < sizeof(modules) / sizeof(modules[0]); i++) {
		if (!modules[i])
			continue;
		FARPROC symbol = GetProcAddress(modules[i], name);
		if (symbol)
			return (void *)symbol;
	}
	return NULL;
#else
	void *symbol = dlsym(RTLD_DEFAULT, name);
	if (symbol)
		return symbol;

	/* OBS loads these libraries through its app rpath. Reusing a loaded handle
	 * keeps the bridge independent of the OBS installation path. */
	void *frontend = dlopen("obs-frontend-api.dylib", RTLD_LAZY | RTLD_NOLOAD);
	if (frontend) {
		symbol = dlsym(frontend, name);
		if (symbol)
			return symbol;
	}
	void *libobs = dlopen("libobs.framework/Versions/A/libobs", RTLD_LAZY | RTLD_NOLOAD);
	if (libobs) {
		symbol = dlsym(libobs, name);
		if (symbol)
			return symbol;
	}

#if defined(__APPLE__)
	/* Hardened macOS builds may not resolve OBS framework symbols through the
	 * default handle. Inspect the already-loaded images and ask dyld for the
	 * exact absolute path instead of guessing the OBS installation directory. */
	uint32_t image_count = _dyld_image_count();
	for (uint32_t i = 0; i < image_count; i++) {
		const char *image_name = _dyld_get_image_name(i);
		if (!image_name || (!strstr(image_name, "libobs") &&
					   !strstr(image_name, "obs-frontend-api")))
			continue;
		void *handle = dlopen(image_name, RTLD_LAZY | RTLD_NOLOAD);
		if (!handle)
			continue;
		symbol = dlsym(handle, name);
		if (symbol)
			return symbol;
	}
#endif
	return NULL;
#endif
}

static bool mce_resolve_api(void)
{
	if (mce.resolved)
		return true;

#define MCE_RESOLVE(field, type, symbol)                                                                      \
	do {                                                                                                         \
		mce.field = (type)mce_lookup_symbol(symbol);                                                              \
		if (!mce.field)                                                                                            \
			return false;                                                                                            \
	} while (0)

	MCE_RESOLVE(register_source, mce_register_source_fn, "obs_register_source_s");
	MCE_RESOLVE(data_create, mce_data_create_fn, "obs_data_create");
	MCE_RESOLVE(data_release, mce_data_release_fn, "obs_data_release");
	MCE_RESOLVE(data_set_string, mce_data_set_string_fn, "obs_data_set_string");
	MCE_RESOLVE(data_set_int, mce_data_set_int_fn, "obs_data_set_int");
	MCE_RESOLVE(data_get_string, mce_data_get_string_fn, "obs_data_get_string");
	MCE_RESOLVE(data_get_int, mce_data_get_int_fn, "obs_data_get_int");
	MCE_RESOLVE(source_create_private, mce_source_create_private_fn, "obs_source_create_private");
	MCE_RESOLVE(source_release, mce_source_release_fn, "obs_source_release");
	MCE_RESOLVE(frontend_set_transition, mce_frontend_set_transition_fn, "obs_frontend_set_current_transition");
	MCE_RESOLVE(frontend_set_duration, mce_frontend_set_duration_fn, "obs_frontend_set_transition_duration");

#undef MCE_RESOLVE
	mce.resolved = true;
	return true;
}

static void mce_log(const char *message)
{
	if (!message)
		return;
	fprintf(stderr, "[MCE OBS Bridge] %s\n", message);
}

static bool mce_ensure_move_transition(obs_data_t *settings)
{
	if (!mce_resolve_api()) {
		mce_log("OBS API symbols are unavailable");
		return false;
	}

	const char *transition_id = mce.data_get_string(settings, "transition_id");
	if (!transition_id || !transition_id[0])
		transition_id = MCE_MOVE_TRANSITION_ID;
	if (strcmp(transition_id, MCE_MOVE_TRANSITION_ID) != 0) {
		mce_log("Rejected a transition id other than move_transition");
		return false;
	}

	const char *transition_name = mce.data_get_string(settings, "transition_name");
	if (!transition_name || !transition_name[0])
		transition_name = MCE_MOVE_TRANSITION_NAME;

	obs_data_t *move_settings = mce.data_create();
	if (!move_settings)
		return false;

	/* Keep Move-specific settings isolated from the bridge input settings. The
	 * official Move plugin supplies its own defaults when settings are empty. */
	obs_source_t *transition =
		mce.source_create_private(transition_id, transition_name, move_settings);
	mce.data_release(move_settings);
	if (!transition) {
		mce_log("Move Transition is not available in this OBS session");
		return false;
	}

	mce.frontend_set_transition(transition);
	long long duration = mce.data_get_int(settings, "duration_ms");
	if (duration <= 0)
		duration = MCE_DEFAULT_DURATION_MS;
	if (duration > 10000)
		duration = 10000;
	mce.frontend_set_duration((int)duration);
	mce.source_release(transition);
	return true;
}

static const char *mce_bridge_get_name(void *type_data)
{
	(void)type_data;
	return "MakeChurchEasy Move Bridge";
}

static void *mce_bridge_create(obs_data_t *settings, obs_source_t *source)
{
	(void)source;
	if (!mce_ensure_move_transition(settings))
		return NULL;
	return (void *)1;
}

static void mce_bridge_update(void *data, obs_data_t *settings)
{
	(void)data;
	mce_ensure_move_transition(settings);
}

static void mce_bridge_destroy(void *data)
{
	(void)data;
}

static void mce_bridge_defaults(obs_data_t *settings)
{
	if (!mce_resolve_api())
		return;
	mce.data_set_string(settings, "transition_id", MCE_MOVE_TRANSITION_ID);
	mce.data_set_string(settings, "transition_name", MCE_MOVE_TRANSITION_NAME);
	mce.data_set_int(settings, "duration_ms", MCE_DEFAULT_DURATION_MS);
}

static struct obs_source_info mce_bridge_source = {
	.id = MCE_BRIDGE_SOURCE_ID,
	.type = OBS_SOURCE_TYPE_INPUT,
	.output_flags = OBS_SOURCE_CAP_DISABLED,
	.get_name = mce_bridge_get_name,
	.create = mce_bridge_create,
	.destroy = mce_bridge_destroy,
	.get_defaults = mce_bridge_defaults,
	.update = mce_bridge_update,
};

bool obs_module_load(void)
{
	if (!mce_resolve_api()) {
		mce_log("Could not resolve OBS APIs; bridge will not load");
		return false;
	}
	mce.register_source(&mce_bridge_source, sizeof(mce_bridge_source));
	return true;
}
