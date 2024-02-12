export type CurrentUser = {
    type: string;
    links: {
        avatar?: {
            href: string;
            name: string;
        };
    };
    created_on: string;
    display_name: string;
    username: string;
    uuid: string;
};

export type PublicRepositoriesQueryParams = {
    /** Filter the results to include only repositories created on or after this ISO-8601 timestamp. Example: YYYY-MM-DDTHH:mm:ss.sssZ */
    after: string;
    /** Filters the result based on the authenticated user's role on each repository. */
    role: 'member' | 'contributor' | 'admin' | 'owner';
    /** Query string to narrow down the response as per filtering and sorting. role parameter must also be specified. */
    q: string;
    /** Field by which the results should be sorted as per filtering and sorting. */
    sort: string;
};

type ListingResponse<TValue> = {
    size: number;
    page: number;
    pagelen: number;
    next: string;
    previous: string;
    values: TValue[];
};

export type PublicRepositoriesResponse = ListingResponse<Repository>;

type Repository = {
    type: string;
    links: Links;
    uuid: string;
    full_name: string;
    is_private: boolean;
    scm: string;
    owner: Owner;
    name: string;
    description: string;
    created_on: string;
    updated_on: string;
    size: number;
    language: string;
    has_issues: boolean;
    has_wiki: boolean;
    fork_policy: string;
    project: Project;
    mainbranch: Mainbranch;
};

type Links = {
    self: Self;
    html: Html;
    avatar: Avatar;
    pullrequests: Pullrequests;
    commits: Commits;
    forks: Forks;
    watchers: Watchers;
    downloads: Downloads;
    clone: Clone[];
    hooks: Hooks;
};

type Self = {
    href: string;
    name: string;
};

type Html = {
    href: string;
    name: string;
};

type Avatar = {
    href: string;
    name: string;
};

type Pullrequests = {
    href: string;
    name: string;
};

type Commits = {
    href: string;
    name: string;
};

type Forks = {
    href: string;
    name: string;
};

type Watchers = {
    href: string;
    name: string;
};

type Downloads = {
    href: string;
    name: string;
};

type Clone = {
    href: string;
    name: string;
};

type Hooks = {
    href: string;
    name: string;
};

type Owner = {
    type: string;
};

type Project = {
    type: string;
};

type Mainbranch = {
    type: string;
};
