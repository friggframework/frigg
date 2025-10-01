/**
 * Use case for getting the current Git repository status
 */
export class GetRepositoryStatusUseCase {
  constructor({ gitAdapter }) {
    this.gitAdapter = gitAdapter
  }

  async execute() {
    const repository = await this.gitAdapter.getRepository()
    return repository.toJSON()
  }
}