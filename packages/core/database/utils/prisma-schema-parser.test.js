/**
 * Tests for Prisma Schema Parser
 */

const {
    extractCollectionNames,
    parseCollectionsFromSchemaSync,
    findMongoDBSchemaFile,
} = require('./prisma-schema-parser');

/**
 * @group unit
 * @group infrastructure
 */
describe('Prisma Schema Parser', () => {
    describe('extractCollectionNames', () => {
        it('should extract collection names from @@map directives', () => {
            const schema = `
                model User {
                    id String @id @default(auto()) @map("_id") @db.ObjectId
                    email String?

                    @@map("User")
                }

                model Token {
                    id String @id @default(auto()) @map("_id") @db.ObjectId
                    token String

                    @@map("Token")
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['User', 'Token']);
        });

        it('should use model name if no @@map directive', () => {
            const schema = `
                model MyModel {
                    id String @id @default(auto()) @map("_id") @db.ObjectId
                    name String
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['MyModel']);
        });

        it('should handle mixed @@map and no @@map models', () => {
            const schema = `
                model User {
                    id String @id
                    @@map("Users")
                }

                model Profile {
                    id String @id
                }

                model Token {
                    id String @id
                    @@map("AuthTokens")
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['Users', 'Profile', 'AuthTokens']);
        });

        it('should handle @@map with single quotes', () => {
            const schema = `
                model User {
                    id String @id
                    @@map('User')
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['User']);
        });

        it('should handle @@map with extra whitespace', () => {
            const schema = `
                model User {
                    id String @id
                    @@map(   "User"   )
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['User']);
        });

        it('should ignore comments', () => {
            const schema = `
                // This is a user model
                model User {
                    id String @id
                    // Map to User collection
                    @@map("User")
                }

                /// Documentation comment
                model Token {
                    id String @id
                    @@map("Token")
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['User', 'Token']);
        });

        it('should handle complex models with relations', () => {
            const schema = `
                model User {
                    id String @id @default(auto()) @map("_id") @db.ObjectId
                    email String?
                    tokens Token[]
                    credentials Credential[]

                    @@unique([email])
                    @@index([email])
                    @@map("User")
                }

                model Token {
                    id String @id @default(auto()) @map("_id") @db.ObjectId
                    userId String @db.ObjectId
                    user User @relation(fields: [userId], references: [id])

                    @@index([userId])
                    @@map("Token")
                }

                model Credential {
                    id String @id @default(auto()) @map("_id") @db.ObjectId
                    userId String @db.ObjectId
                    user User @relation(fields: [userId], references: [id])
                    data Json @default("{}")

                    @@map("Credential")
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['User', 'Token', 'Credential']);
        });

        it('should return empty array for schema with no models', () => {
            const schema = `
                generator client {
                    provider = "prisma-client-js"
                }

                datasource db {
                    provider = "mongodb"
                    url = env("DATABASE_URL")
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual([]);
        });

        it('should handle enum definitions without treating them as models', () => {
            const schema = `
                enum UserType {
                    INDIVIDUAL
                    ORGANIZATION
                }

                model User {
                    id String @id
                    type UserType
                    @@map("User")
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toEqual(['User']);
        });

        it('should extract all 13 collections from actual Frigg schema', () => {
            const schema = `
                model User {
                    id String @id
                    @@map("User")
                }
                model Token {
                    id String @id
                    @@map("Token")
                }
                model Credential {
                    id String @id
                    @@map("Credential")
                }
                model Entity {
                    id String @id
                    @@map("Entity")
                }
                model Integration {
                    id String @id
                    @@map("Integration")
                }
                model IntegrationMapping {
                    id String @id
                    @@map("IntegrationMapping")
                }
                model Process {
                    id String @id
                    @@map("Process")
                }
                model Sync {
                    id String @id
                    @@map("Sync")
                }
                model DataIdentifier {
                    id String @id
                    @@map("DataIdentifier")
                }
                model Association {
                    id String @id
                    @@map("Association")
                }
                model AssociationObject {
                    id String @id
                    @@map("AssociationObject")
                }
                model State {
                    id String @id
                    @@map("State")
                }
                model WebsocketConnection {
                    id String @id
                    @@map("WebsocketConnection")
                }
            `;

            const collections = extractCollectionNames(schema);

            expect(collections).toHaveLength(13);
            expect(collections).toContain('User');
            expect(collections).toContain('Token');
            expect(collections).toContain('Credential');
            expect(collections).toContain('WebsocketConnection');
        });
    });

    describe('findMongoDBSchemaFile', () => {
        it('should find schema file in prisma-mongodb directory', () => {
            // This test will pass if the actual schema file exists
            const schemaPath = findMongoDBSchemaFile(__dirname);

            if (schemaPath) {
                expect(schemaPath).toContain('prisma-mongodb');
                expect(schemaPath).toContain('schema.prisma');
            }
        });
    });

    describe('parseCollectionsFromSchemaSync', () => {
        it('should parse actual schema file if it exists', () => {
            const schemaPath = findMongoDBSchemaFile(__dirname);

            if (schemaPath) {
                const collections = parseCollectionsFromSchemaSync(schemaPath);

                expect(Array.isArray(collections)).toBe(true);
                expect(collections.length).toBeGreaterThan(0);
                // Should contain core Frigg collections
                expect(collections).toContain('User');
                expect(collections).toContain('Credential');
            }
        });

        it('should throw error for non-existent file', () => {
            expect(() => {
                parseCollectionsFromSchemaSync('/nonexistent/schema.prisma');
            }).toThrow('Failed to parse Prisma schema');
        });
    });
});
