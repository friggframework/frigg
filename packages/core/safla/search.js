/**
 * SAFLA Search - High-performance search for integrations
 */
const SAFLAClient = require('./client');

class SAFLASearch {
    constructor(client) {
        this.client = client || new SAFLAClient();
        this.searchIndex = new Map();
        this.embeddings = new Map();
    }

    /**
     * Index integrations for fast search
     */
    async indexIntegrations(integrations) {
        const texts = integrations.map(int => 
            `${int.name} ${int.description} ${int.tags?.join(' ') || ''} ${int.category || ''}`
        );
        
        // Generate embeddings for all integrations
        const embeddings = await this.client.generateEmbeddings(texts);
        
        // Store in search index
        integrations.forEach((integration, index) => {
            const id = integration.id || integration.name;
            this.searchIndex.set(id, {
                ...integration,
                embedding: embeddings[index].embedding,
                indexedAt: new Date()
            });
            this.embeddings.set(id, embeddings[index].embedding);
        });
        
        // Store index in SAFLA memory
        await this.client.storeMemory({
            type: 'search_index',
            integrations: integrations.length,
            timestamp: new Date()
        }, 'procedural');
        
        return {
            indexed: integrations.length,
            timestamp: new Date()
        };
    }

    /**
     * Search integrations using semantic similarity
     */
    async searchIntegrations(query, options = {}) {
        const {
            limit = 10,
            threshold = 0.7,
            filters = {},
            includeScore = true
        } = options;
        
        // Generate embedding for query
        const [queryEmbedding] = await this.client.generateEmbeddings([query]);
        
        // Calculate similarities
        const results = [];
        for (const [id, data] of this.searchIndex) {
            // Apply filters
            if (filters.category && data.category !== filters.category) continue;
            if (filters.tags && !filters.tags.some(tag => data.tags?.includes(tag))) continue;
            
            // Calculate cosine similarity
            const similarity = this._cosineSimilarity(
                queryEmbedding.embedding,
                data.embedding
            );
            
            if (similarity >= threshold) {
                results.push({
                    ...data,
                    score: includeScore ? similarity : undefined
                });
            }
        }
        
        // Sort by similarity and limit results
        results.sort((a, b) => (b.score || 0) - (a.score || 0));
        const topResults = results.slice(0, limit);
        
        // Store search query in memory for analytics
        await this.client.storeMemory({
            type: 'search_query',
            query,
            resultsCount: topResults.length,
            timestamp: new Date()
        }, 'episodic');
        
        return {
            query,
            results: topResults,
            total: results.length,
            timestamp: new Date()
        };
    }

    /**
     * Find similar integrations
     */
    async findSimilar(integrationId, limit = 5) {
        const sourceEmbedding = this.embeddings.get(integrationId);
        if (!sourceEmbedding) {
            throw new Error(`Integration ${integrationId} not found in index`);
        }
        
        const similarities = [];
        for (const [id, embedding] of this.embeddings) {
            if (id === integrationId) continue;
            
            const similarity = this._cosineSimilarity(sourceEmbedding, embedding);
            similarities.push({
                id,
                similarity,
                integration: this.searchIndex.get(id)
            });
        }
        
        similarities.sort((a, b) => b.similarity - a.similarity);
        return similarities.slice(0, limit);
    }

    /**
     * Suggest integrations based on usage patterns
     */
    async suggestIntegrations(currentIntegrations, options = {}) {
        const {
            limit = 5,
            excludeCategories = [],
            preferredCategories = []
        } = options;
        
        // Analyze current integration patterns
        const patterns = await this.client.detectPatterns(
            currentIntegrations.map(int => ({
                category: int.category,
                tags: int.tags,
                features: int.features
            }))
        );
        
        // Build recommendation query
        const categories = [...new Set(currentIntegrations.map(int => int.category))];
        const tags = [...new Set(currentIntegrations.flatMap(int => int.tags || []))];
        
        const query = `integrations similar to ${categories.join(' ')} with features ${tags.join(' ')}`;
        
        // Search for recommendations
        const searchResults = await this.searchIntegrations(query, {
            limit: limit * 2,
            filters: {
                excludeIds: currentIntegrations.map(int => int.id)
            }
        });
        
        // Filter and rank recommendations
        let recommendations = searchResults.results.filter(result => {
            if (excludeCategories.includes(result.category)) return false;
            return true;
        });
        
        // Boost preferred categories
        if (preferredCategories.length > 0) {
            recommendations = recommendations.map(rec => ({
                ...rec,
                score: preferredCategories.includes(rec.category) 
                    ? (rec.score || 1) * 1.2 
                    : rec.score
            }));
            recommendations.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
        
        return {
            recommendations: recommendations.slice(0, limit),
            basedOn: currentIntegrations.length,
            patterns,
            timestamp: new Date()
        };
    }

    /**
     * Auto-complete integration search
     */
    async autocomplete(prefix, limit = 5) {
        const matches = [];
        
        for (const [id, data] of this.searchIndex) {
            if (data.name.toLowerCase().startsWith(prefix.toLowerCase()) ||
                data.tags?.some(tag => tag.toLowerCase().startsWith(prefix.toLowerCase()))) {
                matches.push({
                    id,
                    name: data.name,
                    category: data.category,
                    matchType: data.name.toLowerCase().startsWith(prefix.toLowerCase()) 
                        ? 'name' 
                        : 'tag'
                });
            }
        }
        
        return matches.slice(0, limit);
    }

    /**
     * Get search analytics
     */
    async getSearchAnalytics(timeRange = 'day') {
        const memories = await this.client.retrieveMemories('search_query', 100);
        
        const analytics = {
            totalSearches: memories.matches?.length || 0,
            popularQueries: [],
            averageResultsCount: 0,
            searchTrends: [],
            timestamp: new Date()
        };
        
        return analytics;
    }

    // Helper method for cosine similarity
    _cosineSimilarity(vec1, vec2) {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }
}

module.exports = SAFLASearch;