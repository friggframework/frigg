type AuthorAssociation =
    | 'COLLABORATOR'
    | 'CONTRIBUTOR'
    | 'FIRST_TIMER'
    | 'FIRST_TIME_CONTRIBUTOR'
    | 'MANNEQUIN'
    | 'MEMBER'
    | 'NONE'
    | 'OWNER';

type ReactionRollup = {
    url: string;
    total_count: number;
    '+1': number;
    '-1': number;
    laugh: number;
    confused: number;
    heart: number;
    hooray: number;
    eyes: number;
    rocket: number;
};

export type User = {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string | null;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
    starred_at?: string;
};

type GithubApp = {
    id: number;
    slug?: string;
    node_id: string;
    owner: null | User;
    name: string;
    description: string | null;
    external_url: string;
    html_url: string;
    created_at: string;
    updated_at: string;
    permissions: {
        issues?: string;
        checks?: string;
        metadata?: string;
        contents?: string;
        deployments?: string;
    };
    events: string[];
    installations_count?: number;
    client_id?: string;
    client_secret?: string;
    webhook_secret?: string | null;
    pem?: string;
};

type Milestone = {
    url: string;
    html_url: string;
    labels_url: string;
    id: number;
    node_id: string;
    number: number;
    state: 'open' | 'closed';
    title: string;
    description: string | null;
    creator: null | User;
    open_issues: number;
    closed_issues: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    due_on: string | null;
};

type License = {
    key: string;
    name: string;
    url: string | null;
    spdx_id: string | null;
    node_id: string;
    html_url?: string;
};

export type Repository = {
    id: number;
    node_id: string;
    name: string;
    full_name: string;
    license: null | License;
    organization?: null | User;
    forks: number;
    permissions?: {
        admin: boolean;
        pull: boolean;
        triage?: boolean;
        push: boolean;
        maintain?: boolean;
    };
    owner: User;
    private: boolean;
    html_url: string;
    description: string | null;
    fork: boolean;
    url: string;
    archive_url: string;
    assignees_url: string;
    blobs_url: string;
    branches_url: string;
    collaborators_url: string;
    comments_url: string;
    commits_url: string;
    compare_url: string;
    contents_url: string;
    contributors_url: string;
    deployments_url: string;
    downloads_url: string;
    events_url: string;
    forks_url: string;
    git_commits_url: string;
    git_refs_url: string;
    git_tags_url: string;
    git_url: string;
    issue_comment_url: string;
    issue_events_url: string;
    issues_url: string;
    keys_url: string;
    labels_url: string;
    languages_url: string;
    merges_url: string;
    milestones_url: string;
    notifications_url: string;
    pulls_url: string;
    releases_url: string;
    ssh_url: string;
    stargazers_url: string;
    statuses_url: string;
    subscribers_url: string;
    subscription_url: string;
    tags_url: string;
    teams_url: string;
    trees_url: string;
    clone_url: string;
    mirror_url: string | null;
    hooks_url: string;
    svn_url: string;
    homepage: string | null;
    language: string | null;
    forks_count: number;
    stargazers_count: number;
    watchers_count: number;
    size: number;
    default_branch: string;
    open_issues_count: number;
    is_template?: boolean;
    topics?: string[];
    has_issues: boolean;
    has_projects: boolean;
    has_wiki: boolean;
    has_pages: boolean;
    has_downloads: boolean;
    has_discussions?: boolean;
    archived: boolean;
    disabled: boolean;
    visibility?: string;
    pushed_at: string | null;
    created_at: string | null;
    updated_at: string | null;
    allow_rebase_merge?: boolean;
    template_repository?: {
        id?: number;
        node_id?: string;
        name?: string;
        full_name?: string;
        owner?: {
            login?: string;
            id?: number;
            node_id?: string;
            avatar_url?: string;
            gravatar_id?: string;
            url?: string;
            html_url?: string;
            followers_url?: string;
            following_url?: string;
            gists_url?: string;
            starred_url?: string;
            subscriptions_url?: string;
            organizations_url?: string;
            repos_url?: string;
            events_url?: string;
            received_events_url?: string;
            type?: string;
            site_admin?: boolean;
        };
        private?: boolean;
        html_url?: string;
        description?: string;
        fork?: boolean;
        url?: string;
        archive_url?: string;
        assignees_url?: string;
        blobs_url?: string;
        branches_url?: string;
        collaborators_url?: string;
        comments_url?: string;
        commits_url?: string;
        compare_url?: string;
        contents_url?: string;
        contributors_url?: string;
        deployments_url?: string;
        downloads_url?: string;
        events_url?: string;
        forks_url?: string;
        git_commits_url?: string;
        git_refs_url?: string;
        git_tags_url?: string;
        git_url?: string;
        issue_comment_url?: string;
        issue_events_url?: string;
        issues_url?: string;
        keys_url?: string;
        labels_url?: string;
        languages_url?: string;
        merges_url?: string;
        milestones_url?: string;
        notifications_url?: string;
        pulls_url?: string;
        releases_url?: string;
        ssh_url?: string;
        stargazers_url?: string;
        statuses_url?: string;
        subscribers_url?: string;
        subscription_url?: string;
        tags_url?: string;
        teams_url?: string;
        trees_url?: string;
        clone_url?: string;
        mirror_url?: string;
        hooks_url?: string;
        svn_url?: string;
        homepage?: string;
        language?: string;
        forks_count?: number;
        stargazers_count?: number;
        watchers_count?: number;
        size?: number;
        default_branch?: string;
        open_issues_count?: number;
        is_template?: boolean;
        topics?: string[];
        has_issues?: boolean;
        has_projects?: boolean;
        has_wiki?: boolean;
        has_pages?: boolean;
        has_downloads?: boolean;
        archived?: boolean;
        disabled?: boolean;
        visibility?: string;
        pushed_at?: string;
        created_at?: string;
        updated_at?: string;
        permissions?: {
            admin?: boolean;
            maintain?: boolean;
            push?: boolean;
            triage?: boolean;
            pull?: boolean;
        };
        allow_rebase_merge?: boolean;
        temp_clone_token?: string;
        allow_squash_merge?: boolean;
        allow_auto_merge?: boolean;
        delete_branch_on_merge?: boolean;
        allow_update_branch?: boolean;
        use_squash_pr_title_as_default?: boolean;
        squash_merge_commit_title?: 'PR_TITLE' | 'COMMIT_OR_PR_TITLE';
        squash_merge_commit_message?: 'PR_BODY' | 'COMMIT_MESSAGES' | 'BLANK';
        merge_commit_title?: 'PR_TITLE' | 'MERGE_MESSAGE';
        merge_commit_message?: 'PR_BODY' | 'PR_TITLE' | 'BLANK';
        allow_merge_commit?: boolean;
        subscribers_count?: number;
        network_count?: number;
    } | null;
    temp_clone_token?: string;
    allow_squash_merge?: boolean;
    allow_auto_merge?: boolean;
    delete_branch_on_merge?: boolean;
    allow_update_branch?: boolean;
    use_squash_pr_title_as_default?: boolean;
    squash_merge_commit_title?: 'PR_TITLE' | 'COMMIT_OR_PR_TITLE';
    squash_merge_commit_message?: 'PR_BODY' | 'COMMIT_MESSAGES' | 'BLANK';
    merge_commit_title?: 'PR_TITLE' | 'MERGE_MESSAGE';
    merge_commit_message?: 'PR_BODY' | 'PR_TITLE' | 'BLANK';
    allow_merge_commit?: boolean;
    allow_forking?: boolean;
    web_commit_signoff_required?: boolean;
    subscribers_count?: number;
    network_count?: number;
    open_issues: number;
    watchers: number;
    master_branch?: string;
    starred_at?: string;
    anonymous_access_enabled?: boolean;
};

export type Issue = {
    id: number;
    node_id: string;
    /**
     * URL for the issue
     */
    url: string;
    repository_url: string;
    labels_url: string;
    comments_url: string;
    events_url: string;
    html_url: string;
    /**
     * Number uniquely identifying the issue within its repository
     */
    number: number;
    /**
     * State of the issue; either 'open' or 'closed'
     */
    state: string;
    /**
     * The reason for the current state
     */
    state_reason?: 'completed' | 'reopened' | 'not_planned' | null;
    /**
     * Title of the issue
     */
    title: string;
    /**
     * Contents of the issue
     */
    body?: string | null;
    user: null | User;
    /**
     * Labels to associate with this issue; pass one or more label names to replace the set of labels on this issue; send an empty array to clear all labels from the issue; note that the labels are silently dropped for users without push access to the repository
     */
    labels: (
        | string
        | {
              id?: number;
              node_id?: string;
              url?: string;
              name?: string;
              description?: string | null;
              color?: string | null;
              default?: boolean;
          }
    )[];
    assignee: null | User;
    assignees?: User[] | null;
    milestone: null | Milestone;
    locked: boolean;
    active_lock_reason?: string | null;
    comments: number;
    pull_request?: {
        merged_at?: string | null;
        diff_url: string | null;
        html_url: string | null;
        patch_url: string | null;
        url: string | null;
    };
    closed_at: string | null;
    created_at: string;
    updated_at: string;
    draft?: boolean;
    closed_by?: null | User;
    body_html?: string;
    body_text?: string;
    timeline_url?: string;
    repository?: Repository;
    performed_via_github_app?: null | GitHubApp;
    author_association: AuthorAssociation;
    reactions?: ReactionRollup;
};
