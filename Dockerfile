FROM nginx:alpine
COPY . /usr/share/nginx/html
# Stamp a content hash into the ?v=dev asset URLs so browsers fetch new CSS/JS on every change.
RUN mv /usr/share/nginx/html/nginx.conf /etc/nginx/conf.d/default.conf \
 && cd /usr/share/nginx/html \
 && V=$(cat styles.css script.js | md5sum | cut -c1-10) \
 && sed -i -e "s/styles\.css?v=dev/styles.css?v=$V/g" -e "s/script\.js?v=dev/script.js?v=$V/g" *.html \
 && grep -q "styles.css?v=$V" index.html \
 && ! grep -l "?v=dev" *.html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
