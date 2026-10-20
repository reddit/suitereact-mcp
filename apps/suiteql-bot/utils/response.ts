/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */

export const errorResponse = (e: string, msg?: string) => {
  return JSON.stringify({
    success: false,
    error: e,
    message: msg || 'An error occurred',
  });
};

export const successResponse = (data: any, msg?: string) => {
  return JSON.stringify({
    success: true,
    data,
    message: msg || '',
  });
};
