import dev from './dev';
import prod from './prod';
import test from './test';

const env = process.env.NODE_ENV

const configMap = {
    'development': dev,
    'test': test,
    'production': prod
}



export default configMap[env] ?? prod

