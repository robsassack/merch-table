FROM mwader/static-ffmpeg:7.1.1 AS ffmpeg

FROM node:22-bookworm-slim

WORKDIR /app

COPY --from=ffmpeg /ffmpeg /usr/local/bin/ffmpeg
COPY --from=ffmpeg /ffprobe /usr/local/bin/ffprobe
RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe
