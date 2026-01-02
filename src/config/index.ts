import dev from "./file/dev";
import prod from "./file/prod";
import {
	env
} from '@/env'

const configMap = {
	development: dev,
	production: prod,
};

export default configMap[env] ?? prod;
