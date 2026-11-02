# Look Around With frigg ui

Optional, but fun: the Frigg Management UI is a local dashboard for your app.

From your app folder:

```bash
npx frigg ui
```

`frigg ui` finds the Frigg app in the current folder and opens your browser. Two flags are worth knowing:

* `--port <port>` sets the port for the UI's server. The default is **3210**.
* `--no-open` stops it from opening a browser.

## About ports

`frigg start` already holds port **3001**, and the UI's default of 3210 stays out of its way, so you can run both at once. If 3210 is taken on your machine, pick another:

```bash
npx frigg ui --port 3300
```

Don't pass `--port 3001` while `frigg start` is running, or the two will collide.

Unless `NODE_ENV` is `production`, `frigg ui` runs in development mode. It also starts a Vite dev server for the frontend at `http://localhost:5173`, and that's the address it opens.

{% hint style="warning" %}
**Known issue (2.0 prereleases):** in a freshly scaffolded app, `frigg ui` can fail to start because the installed `@friggframework/devtools` package doesn't include everything the Management UI needs. You'll see errors such as `Missing script: "server"` or `Cannot find module .../management-ui/server/index.js`. Your backend isn't affected. Skip this step and carry on.
{% endhint %}

Next (optional): [use MongoDB instead of PostgreSQL](using-mongodb.md).
