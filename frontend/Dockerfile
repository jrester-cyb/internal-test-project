FROM node:24-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Create fresh .npmrc pointing to public registry and install
RUN echo "registry=https://registry.npmjs.org/" > .npmrc && \
    npm install

# Copy the rest of the application
COPY . .

# Expose the port Vite runs on
EXPOSE 5173

# Start the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
