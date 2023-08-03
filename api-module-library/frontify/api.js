const fetch = require('node-fetch');
const { get } = require('@friggframework/assertions');
const { OAuth2Requester } = require('@friggframework/module-plugin');
const querystring = require('querystring');

class Api extends OAuth2Requester {
    constructor(params) {
        super(params);
        this.domain = get(params, 'domain', null);

        if (this.domain) {
            this.baseUrl = `https://${this.domain}/graphql`;
            this.tokenUri = `https://${this.domain}/api/oauth/accesstoken`;
        }
    }

    setDomain(domain) {
        this.domain = domain;
        this.baseUrl = `https://${this.domain}/graphql`;
        this.tokenUri = `https://${this.domain}/api/oauth/accesstoken`;
    }

    getAuthUri() {
        const query = {
            client_id: this.client_id,
            response_type: 'code',
            redirect_uri: this.redirect_uri,
            scope: this.scope,
            state: this.state,
        };

        let authorizationUri;

        if (this.domain) {
            authorizationUri = `https://${this.domain}/api/oauth/authorize`;
        } else {
            authorizationUri = 'https://{{domain}}/api/oauth/authorize';
        }

        return `${authorizationUri}?${querystring.stringify(query)}`;
    }

    buildRequestOptions(query) {
        return {
            url: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
            body: {
                query,
            },
        };
    }

    assertResponse(response) {
        if (response.errors) {
            const { errors } = response;
            throw new Error(errors[0].message);
        }
    }

    async getUser() {
        const query = `query CurrentUser {
                         currentUser {
                           id
                           email
                           name
                         }
                       }`;

        const response = await this._post(this.buildRequestOptions(query));
        this.assertResponse(response);
        return {
            user: response.data.currentUser,
        };
    }

    async getAsset(query) {
        const ql = `query Asset {
                      asset(id: "${query.assetId}") {
                        id
                        title
                        status
                        __typename
                        tags {
                          source
                          value
                        }
                        ${this._filesQuery()}
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return response.data.asset;
    }

    async getAssetPermissions(query) {
        const ql = `query AssetPermissions {
                      asset(id: "${query.assetId}") {
                          currentUserPermissions {
                            canEdit
                            canDelete
                            canComment
                            canDownload
                          }
                        }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            permissions: response.data.asset.currentUserPermissions,
        };
    }

    async getLibraryPermissions(query) {
        const ql = `query LibraryPermissions {
                      library(id: "${query.libraryId}") {
                          currentUserPermissions {
                            canCreateAssets
                            canViewCollaborators
                            canCreateCollections
                          }
                        }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            permissions: response.data.library.currentUserPermissions,
        };
    }

    async getProjectPermissions(query) {
        const ql = `query ProjectPermissions {
                      workspaceProject(id: "${query.projectId}") {
                          currentUserPermissions {
                            canCreateAssets
                            canViewCollaborators
                          }
                        }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            permissions: response.data.workspaceProject.currentUserPermissions,
        };
    }

    async listBrandPermissions(query) {
        const ql = `query Brands {
                      brand(id: "${query.brandId}") {
                        libraries {
                          items {
                            id
                            name
                            currentUserPermissions {
                              canCreateAssets
                              canViewCollaborators
                              canCreateCollections
                            }
                          }
                        }
                        workspaceProjects{
                          items{
                            id
                            name
                            currentUserPermissions{
                              canCreateAssets
                              canViewCollaborators
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);

        const { brand } = response.data;

        const libraries = brand.libraries.items.map(item => ({
            id: item.id,
            name: item.name,
            permissions: item.currentUserPermissions
        }));

        const projects = brand.workspaceProjects.items.map(item => ({
            id: item.id,
            name: item.name,
            permissions: item.currentUserPermissions
        }));

        return { libraries, projects };
    }

    async getSearchFilterOptions() {
        return {
            status: ['FINISHED', 'PROCESSING', 'PROCESSING_FAILED'],
            fileTypes: [
                'Audio',
                'Document',
                'File',
                'Image',
                'Video',
                'EmbeddedContent'
            ]
        };
    }

    async listBrands() {
        const ql = `query Brands {
                      brands {
                        id
                        avatar
                        name
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return response.data;
    }

    async listProjects(query) {
        const ql = `query Projects {
                      brand(id: "${query.brandId}") {
                        workspaceProjects {
                          items {
                            id
                            name
                            currentUserPermissions {
                              canCreateAssets
                              canViewCollaborators
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            projects: response.data.brand.workspaceProjects?.items,
        };
    }

    async listLibraries(query) {
        const ql = `query Libraries {
                      brand(id: "${query.brandId}") {
                        libraries {
                          items {
                            id
                            name
                            currentUserPermissions {
                              canCreateAssets
                              canViewCollaborators
                              canCreateCollections
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return response.data.brand.libraries.items;
    }

    async listCollections(query) {
      const ql = `query Collections {
                    library(id: "${query.libraryId}") {
                      collections {
                        items {
                          id
                          name
                          __typename
                        }
                      }
                    }
                  }`;

      const response = await this._post(this.buildRequestOptions(ql));
      this.assertResponse(response);
      return response.data.library.collections.items;
  }

    async listProjectAssets(query) {
        const ql = `query ProjectAssets {
                      workspaceProject(id: "${query.projectId}") {
                        assets {
                          items {
                            id
                            title
                            description
                            tags {
                              source
                              value
                            }
                            __typename
                            ${this._filesQuery()}
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            assets: response.data.workspaceProject?.assets.items,
        };
    }

    async listProjectFolders(query) {
        const ql = `query ProjectFolders {
                      workspaceProject(id: "${query.projectId}") {
                        browse {
                          folders {
                            items {
                              id
                              name
                              __typename
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            folders: response.data.workspaceProject?.browse.folders.items,
        };
    }

    async listLibraryAssets(query) {
        const ql = `query LibraryAssets {
                      library(id: "${query.libraryId}") {
                        assets {
                          items {
                            id
                            title
                            description
                            tags {
                              source
                              value
                            }
                            __typename
                            ${this._filesQuery()}
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            assets: response.data.library.assets.items,
        };
    }

    async listLibraryFolders(query) {
        const ql = `query LibraryFolders {
                      library(id: "${query.libraryId}") {
                        browse {
                          folders {
                            items {
                              id
                              name
                              createdAt
                              modifiedAt
                              __typename
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            folders: response.data.library.browse.folders.items,
        };
    }

    async listSubFolderAssets(query) {
        const ql = `query FolderById {
                                  node(id: "${query.subFolderId}") {
                                    ... on Folder {
                                      name
                                      assets {
                                        items {
                                          id
                                          title
                                          tags {
                                            source
                                            value
                                          }
                                          __typename
                                          ${this._filesQuery()}
                                        }
                                      }
                                    }
                                  }
                                }`;
        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            assets: response.data.node.assets.items,
        };
    }

    async listSubFolderFolders(query) {
        const ql = `query FolderById {
                                  node(id: "${query.subFolderId}") {
                                    ... on Folder {
                                      name
                                      folders {
                                        items {
                                          id
                                          name
                                          __typename
                                        }
                                      }
                                    }
                                  }
                                }`;
        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            folders: response.data.node.folders.items,
        };
    }

    async getResponseUsingQuery(ql) {
        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return response;
    }

    async searchInBrand(query) {
        const ql = `query BrandLevelSearch {
                      brand(id: "${query.brandId}") {
                        id
                        name
                        search(page: 1, limit: ${query.limit}, query: {term: "${query.term}"}) {
                          total
                          edges {
                            title
                            node {
                              ... on Asset {
                                id,
                              modifiedAt,
                              description,
                              createdAt,
                              tags {
                                source,
                                value,
                              },
                              metadataValues {
                                id
                              },
                                externalId,
                                title,
                                status,
                                __typename,
                                creator {
                                  id,
                                  name,
                                  email
                                }

                              },
                              ${this._filesQuery()}
                            }
                          }
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            assets: response.data.brand.search.edges,
        };
    }

    async createAsset(asset) {
        const ql = `mutation CreateAsset {
                      createAsset(input: {
                        fileId: "${asset.id}",
                        title: "${asset.title}",
                        projectId: "${asset.projectId}"
                      }) {
                        job {
                          assetId
                        }
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return {
            id: response.data.createAsset.job.assetId
        };
    }

    async createFileId(input) {
        const ql = `mutation UploadFile {
                      uploadFile(input: {
                        filename: "${input.filename}",
                        size: ${input.size},
                        chunkSize: ${input.chunkSize}
                      }) {
                        id
                        urls
                      }
                    }`;

        const response = await this._post(this.buildRequestOptions(ql));
        this.assertResponse(response);
        return response.data.uploadFile;
    }

    // Total of addresses in urls should match the number of chunks in
    // stream. The code invoking this method should take care of this
    // using a correct "highWaterMark".
    async uploadFile(stream, urls) {
        const responses = [];

        const url = urls.shift();

        const resp = await fetch(url, {
            method: 'PUT',
            headers: {
                'content-type': 'binary'
            },
            body: stream
        });

        responses.push(resp);

        return responses;
    }

    _filesQuery() {
        const commonProps = [
            'description',
            'downloadUrl',
            'filename',
            'previewUrl',
            'size',
            'extension',
            'createdAt',
            'modifiedAt',
        ];

        const dimensionProps = [
            'height',
            'width',
        ];
        return `... on Audio {
                  ${commonProps.join(' ')}
                }
                ... on Document {
                  ${commonProps.join(' ')}
                  ${dimensionProps.join(' ')}
                }
                ... on File {
                  ${commonProps.join(' ')}
                }
                ... on Image {
                  ${commonProps.join(' ')}
                  ${dimensionProps.join(' ')}
                }
                ... on Video {
                  ${commonProps.join(' ')}
                  ${dimensionProps.join(' ')}
                  duration
                  bitrate
                }
                ... on EmbeddedContent {
                  description
                  previewUrl
                  status
                }`;
    }
}

module.exports = { Api };
