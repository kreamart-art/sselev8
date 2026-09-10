FROM nginx:alpine
COPY . /usr/share/nginx/html
RUN mv /usr/share/nginx/html/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
