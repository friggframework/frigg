# Quick Start Tutorial

Aloha! In the next ten-ish minutes you'll scaffold a Frigg backend, give it a database, run it locally, and plug in your first API module. No cloud account, no config spelunking. The defaults are picked for you.

## What you'll build

A Frigg backend app running on your machine:

* PostgreSQL (the default database) in a Docker container
* The Frigg backend running under serverless-offline at `http://localhost:3001`
* A HubSpot integration scaffolded from the API module library
* Optionally, the Frigg Management UI to poke around in

## Prerequisites

* [Node.js](https://nodejs.org/) 22 or later, with npm
* [Docker](https://www.docker.com/products/docker-desktop/), running (or any PostgreSQL you can reach)
* [Git](https://git-scm.com/) (optional; `frigg init` sets up a repository unless you pass `--no-git`)
* A terminal and your favorite editor

{% hint style="info" %}
You don't need an AWS account for this tutorial. Everything runs locally, and `frigg start` skips AWS resource discovery.
{% endhint %}

## The steps

1. [Initialize with `frigg init`](frigg-init.md)
2. [Start your Frigg app](start-your-frigg-app.md): database, `db:setup`, `frigg start`
3. [Add an integration](add-an-integration.md) with `frigg install`
4. [Look around with `frigg ui`](management-ui.md) (optional)
5. [Use MongoDB instead](using-mongodb.md) (optional; PostgreSQL is the default)
