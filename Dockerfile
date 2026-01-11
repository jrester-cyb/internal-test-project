FROM 151885604979.dkr.ecr.us-east-1.amazonaws.com/cybiricalubuntu_python:3.13-24.04

# Arguments for user configuration
ARG USER_ID=1000
ARG GROUP_ID=1000

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Install GeoDjango system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    binutils \
    libproj-dev \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

ENV GDAL_LIBRARY_PATH=/usr/lib/libgdal.so \
    GEOS_LIBRARY_PATH=/usr/lib/libgeos_c.so

COPY requirements.txt /app/
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . /app/

# Change ownership of the app directory to ubuntu user (UID 1000)
RUN chown -R ${USER_ID}:${GROUP_ID} /app

# Switch to non-root user (ubuntu user already exists with UID 1000)
USER ${USER_ID}:${GROUP_ID}

CMD ["gunicorn", "app.wsgi:application", "--bind", "0.0.0.0:80"]
