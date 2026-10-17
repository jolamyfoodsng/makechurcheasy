// ndi_shim.h: the few NDI C structs the NDI-out spike uses (from Processing.NDI.Lib.h, NDI 5/6).
// Functions are looked up with dlsym at run time, like studio_ndi.rs does, so no SDK is needed.
#include <stdbool.h>
#include <stdint.h>

typedef struct { const char *p_ndi_name; const char *p_groups; bool clock_video; bool clock_audio; } ndi_send_create_t;
typedef struct { bool show_local_sources; const char *p_groups; const char *p_extra_ips; } ndi_find_create_t;
typedef struct { const char *p_ndi_name; const char *p_url_address; } ndi_source_t;
typedef struct { ndi_source_t source_to_connect_to; int32_t color_format; int32_t bandwidth; bool allow_video_fields; const char *p_ndi_recv_name; } ndi_recv_create_v3_t;
typedef struct {
    int32_t xres, yres; uint32_t fourcc; int32_t frame_rate_n, frame_rate_d; float picture_aspect_ratio;
    int32_t frame_format_type; int64_t timecode; uint8_t *p_data; int32_t line_stride_in_bytes;
    const char *p_metadata; int64_t timestamp;
} ndi_video_frame_v2_t;

typedef bool (*ndi_initialize_fn)(void);
typedef void *(*ndi_send_create_fn)(const ndi_send_create_t *);
typedef void (*ndi_send_video_fn)(void *, const ndi_video_frame_v2_t *);
typedef int (*ndi_send_connections_fn)(void *, uint32_t);
typedef void *(*ndi_find_create_fn)(const ndi_find_create_t *);
typedef bool (*ndi_find_wait_fn)(void *, uint32_t);
typedef const ndi_source_t *(*ndi_find_sources_fn)(void *, uint32_t *);
typedef void *(*ndi_recv_create_fn)(const ndi_recv_create_v3_t *);
typedef int (*ndi_recv_capture_fn)(void *, ndi_video_frame_v2_t *, void *, void *, uint32_t);
typedef void (*ndi_recv_free_video_fn)(void *, const ndi_video_frame_v2_t *);
