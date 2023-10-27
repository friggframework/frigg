import {Credential, Entity} from "@friggframework/module-plugin";
import {Integration} from "@friggframework/integrations";

export async function mockIntegration(IntegrationClassDef, userId, config = {},) {
    const integration = new IntegrationClassDef();
    integration.delegateTypes.push(...IntegrationClassDef.Config.events)

    const insertOptions = {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
    }
    const user = {user: userId}

    const credential = await Credential.findOneAndUpdate(
        user,
        { $set: user },
        insertOptions
    );
    const entity1 = await Entity.findOneAndUpdate(
        user,
        {
            $set: {
                credential: credential.id,
                user: userId,
                name: 'Test user',
                externalId: '1234567890123456',
            },
        },
        insertOptions
    );
    const entity2 = await Entity.findOneAndUpdate(
        user,
        {
            $set: {
                credential: credential.id,
                user: userId,
            },
        },
        insertOptions
    );

    const entities = [entity1, entity2]
    integration.record = await Integration.create({
        entities,
        user: userId,
        config: {type: IntegrationClassDef.Config.name, ...config}
    })

    integration.id = integration.record._id

    for (const i in entities){
        const [moduleName, ModuleClass] = Object.entries(IntegrationClassDef.modules)[i];
        const module = new ModuleClass({userId})
        module.entity = entities[i];
        integration[moduleName] = module;
    }

    return integration
}
