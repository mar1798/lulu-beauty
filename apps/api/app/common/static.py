import os

from starlette.responses import Response
from starlette.staticfiles import PathLike, StaticFiles
from starlette.types import Scope

# A year, the maximum any cache is meant to honour, plus `immutable` so a browser does not
# even revalidate on reload. Safe because the names are not content-derived by accident:
# `LocalDiskStorage.save` mints a fresh uuid4 per upload and never writes over an existing
# key — replacing a product photo stores a new file and drops the old one, so a given
# /files/<key> either holds the same bytes forever or stops existing.
IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"


class ImmutableStaticFiles(StaticFiles):
    """`StaticFiles` that says how long its files may be cached.

    Plain `StaticFiles` sends only `ETag`/`Last-Modified`, which means every visitor
    re-asks for every product photo on every page view and waits out a round trip for a
    304. The header also travels upstream: Next's image optimiser keeps a re-encoded
    image only for `minimumCacheTTL` when the source says nothing, and re-encodes it from
    scratch afterwards.
    """

    def file_response(
        self,
        full_path: PathLike,
        stat_result: os.stat_result,
        scope: Scope,
        status_code: int = 200,
    ) -> Response:
        response = super().file_response(full_path, stat_result, scope, status_code=status_code)
        # Only for the hit: `StaticFiles` reuses this method for the 404 page, and a
        # year-long "not found" is a lie that outlives the upload that fixes it. A 304
        # keeps the header — `NotModifiedResponse` passes `cache-control` through.
        if status_code == 200:
            response.headers["cache-control"] = IMMUTABLE_CACHE_CONTROL
        return response
