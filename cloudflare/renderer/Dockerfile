FROM --platform=linux/amd64 node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json render.ts frames.ts server.ts ./
USER node
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server.ts"]
