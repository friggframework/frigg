# Hosts

Frigg is a framework you run — not a SaaS that hosts your integrations for you. You (or your agents) scaffold an app, then start it locally or deploy it to cloud infrastructure you control.

Today on `next`, two hosts are supported out of the box: **local** development and **AWS**. Everything else is either in review or still a stub.

## Supported hosts

### Local (`frigg start`)

`frigg start` runs your backend with OSS-Serverless offline (`osls offline`), using the generated `infrastructure.js`. That path skips AWS resource discovery (`FRIGG_SKIP_AWS_DISCOVERY=true`) so you can develop without cloud credentials.

Default ports from the generated serverless-offline config:

| Service | Default port |
| --- | --- |
| HTTP API (`serverless-offline` `httpPort`) | **3001** |
| Lambda invoke | 4001 |
| WebSocket | 3002 |

The Management UI (`frigg ui`) also defaults to **3001**. Until those defaults split, run the UI on another port when both are up:

```bash
frigg start
frigg ui --port 3210
```

Use whichever free port you like for the UI; the important part is that it is not 3001 while `frigg start` is already bound there.

### AWS (`frigg deploy`)

AWS is the only cloud provider implemented on `next`. The provider factory defaults to `aws` when none is set, and deploy tooling expects AWS credentials (`AWS_*` env vars). Region resolution falls back to `AWS_REGION`, then **`us-east-1`**.

Generated infrastructure targets familiar AWS building blocks (Lambda, API Gateway, optional VPC/RDS/KMS/SSM, and so on). For a hands-on walkthrough, see [Deploying to AWS](../tutorials/advanced-tutorials/deploying-your-frigg-application/deploying-to-aws.md).

## Not yet supported

### Netlify — in review

A Netlify provider adapter is in review ([#686](https://github.com/friggframework/frigg/pull/686) / [#545](https://github.com/friggframework/frigg/pull/545)). It is **not** merged on `next` yet — do not treat Netlify as a supported Frigg app host today. (The marketing site at friggframework.org is published with Netlify; that is separate from deploying a Frigg integration app.)

### Azure and GCP — stubs only

Azure and GCP appear in the provider factory as **planned** stubs. Creating either provider throws (“not yet implemented”). Do **not** list them as supported hosts; there is no deploy how-to for them on `next`.

## Choosing a host

| Goal | Host |
| --- | --- |
| Develop and debug integrations | Local (`frigg start` + optional `frigg ui`) |
| Ship to production on infrastructure you own | AWS (`frigg deploy`) |
| Netlify / Azure / GCP as the app runtime | Wait for merged support — or contribute |

Missing something? Request it, or point a coding agent at the relevant spec with our PR instructions; the team reviews for release.
