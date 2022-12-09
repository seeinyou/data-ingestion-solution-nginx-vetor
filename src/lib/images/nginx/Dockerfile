ARG PLATFORM_ARG
#FROM --platform=$PLATFORM_ARG nginx:latest 
#FROM --platform=linux/arm64 nginx:latest
FROM --platform=linux/amd64 nginx:latest 

RUN apt-get update -y && apt-get upgrade -y && apt-get install cron logrotate -y

# default nginx path
ENV SERVER_ENDPOINT_PATH='/collect'

COPY ./config/nginx.conf /etc/nginx/nginx.conf
COPY ./config/nginx-logrotate.conf  /etc/logrotate.d/nginx
COPY ./config/nginx-logrotate-crond.conf  /etc/cron.d/
COPY ./config/docker-entrypoint.sh /

RUN chmod 0644 /etc/cron.d/nginx-logrotate-crond.conf /etc/logrotate.d/nginx

RUN crontab /etc/cron.d/nginx-logrotate-crond.conf
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 8088
